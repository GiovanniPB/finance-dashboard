/**
 * Edge Function: nfse-backfill
 *
 * Emissão RETROATIVA em lote. Drena um `invoice_backfill_runs` (o mais antigo em
 * `status='running'`), lendo cobranças pagas do pagar.me e criando os MESMOS
 * `invoice_jobs` que o webhook criaria — mas sempre como `pending_review`
 * (barreira humana; ver docs/integrations/nfse-backfill-plan.md §3). A EMISSÃO
 * continua na esteira existente (drain/reconcile) após o bulk-approve.
 *
 * Resumível: processa PAGES_PER_INVOCATION páginas por chamada e avança o
 * `page_cursor` com CAS otimista (`.eq('page_cursor', cursor)`) — dois ticks
 * concorrentes não pulam página. Idempotente por `(charge, recipient)`
 * (upsert ignoreDuplicates), então reprocessar é seguro.
 *
 * Fonte do dado (a lista é magra — sem address/split):
 *   GET /charges (enumerar) -> GET /charges/{id} (hidratar) -> parseChargeResource
 *   -> /payables (split autoritativo) -> explodeChargePaid -> upsert.
 *
 * Observabilidade: grava `total_charges` (paging.total, base do %) e
 * `diagnostics` (skips por motivo, recebedores NÃO mapeados vistos, erros) — para
 * a UI explicar exatamente o que aconteceu (ex.: "0 notas" = recebedor não mapeado).
 *
 * Robustez de janela: além do filtro do servidor, filtramos por `created_at` no
 * cliente — se o `/charges` ignorar `created_since/until`, NÃO emitimos fora da
 * janela (as fora contam como skip `out_of_window`, o que também prova o filtro).
 *
 * Acionada por pg_cron ou manual (POST). Auth: header `x-worker-secret`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { fetchChargeDetail, fetchChargesPage } from "../_shared/nfse/charges.ts";
import { parseChargeResource } from "../_shared/nfse/parse.ts";
import {
  applySplitMeta,
  enrichEventAddress,
  loadContext,
  resolveAuthoritativeSplit,
  toRow,
} from "../_shared/nfse/pipeline.ts";
import { explodeChargePaid } from "../_shared/nfse/split.ts";
import type { InvoiceJobDraft, NfseAmbiente, PagarmeAccount } from "../_shared/nfse/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORKER_SECRET = Deno.env.get("NFSE_WORKER_SECRET") ?? "";

const PAGES_PER_INVOCATION = 1; // hidratação é cara (detalhe+payables+cep/cobrança); 1 página/tick cabe no Edge
const MAX_ATTEMPTS = 5; // falhas de listagem consecutivas -> run 'failed'

interface CompanyTally {
  count: number;
  reais: number;
}
interface Preview {
  totalJobs: number;
  totalReais: number;
  incompleteAddress: number;
  byCompany: Record<string, CompanyTally>;
}

/** Diagnóstico acumulado do run (por que cada cobrança não virou nota). */
interface Diagnostics {
  skipReasons: Record<string, number>; // recipient_not_mapped | not_paid | hydrate_failed | out_of_window
  unmappedRecipients: Record<string, number>; // re_id -> ocorrências (o que o operador precisa mapear)
  pageErrors: string[];
}

interface BackfillRun {
  id: string;
  pagarme_account_id: string;
  created_since: string;
  created_until: string;
  page_cursor: number;
  page_size: number;
  dry_run: boolean;
  charges_seen: number;
  jobs_created: number;
  jobs_skipped: number;
  attempts: number;
  total_charges: number | null;
  preview: Preview | null;
  diagnostics: Diagnostics | null;
}

const RUN_COLUMNS =
  "id, pagarme_account_id, created_since, created_until, page_cursor, page_size, dry_run, charges_seen, jobs_created, jobs_skipped, attempts, total_charges, preview, diagnostics";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyPreview(): Preview {
  return { totalJobs: 0, totalReais: 0, incompleteAddress: 0, byCompany: {} };
}
function emptyDiagnostics(): Diagnostics {
  return { skipReasons: {}, unmappedRecipients: {}, pageErrors: [] };
}

function mergePreview(a: Preview, b: Preview): Preview {
  const byCompany: Record<string, CompanyTally> = { ...(a.byCompany ?? {}) };
  for (const [company, tally] of Object.entries(b.byCompany ?? {})) {
    const cur = byCompany[company] ?? { count: 0, reais: 0 };
    byCompany[company] = { count: cur.count + tally.count, reais: cur.reais + tally.reais };
  }
  return {
    totalJobs: (a.totalJobs ?? 0) + b.totalJobs,
    totalReais: Number(((a.totalReais ?? 0) + b.totalReais).toFixed(2)),
    incompleteAddress: (a.incompleteAddress ?? 0) + b.incompleteAddress,
    byCompany,
  };
}

function mergeDiagnostics(a: Diagnostics, b: Diagnostics): Diagnostics {
  // `a` pode vir como {} (default da coluna) -> coalescer cada campo
  const skipReasons: Record<string, number> = { ...(a.skipReasons ?? {}) };
  for (const [k, v] of Object.entries(b.skipReasons ?? {}))
    skipReasons[k] = (skipReasons[k] ?? 0) + v;
  const unmappedRecipients: Record<string, number> = { ...(a.unmappedRecipients ?? {}) };
  for (const [k, v] of Object.entries(b.unmappedRecipients ?? {})) {
    unmappedRecipients[k] = (unmappedRecipients[k] ?? 0) + v;
  }
  return {
    skipReasons,
    unmappedRecipients,
    pageErrors: [...(a.pageErrors ?? []), ...(b.pageErrors ?? [])].slice(-20),
  };
}

function tallyDraft(preview: Preview, draft: InvoiceJobDraft): Preview {
  const warnings = (draft.metadata?.validationWarnings as string[] | undefined) ?? [];
  const incomplete = warnings.includes("tomador_endereco_incompleto") ? 1 : 0;
  const cur = preview.byCompany[draft.companyId] ?? { count: 0, reais: 0 };
  return {
    totalJobs: preview.totalJobs + 1,
    totalReais: Number((preview.totalReais + draft.valorServicos).toFixed(2)),
    incompleteAddress: preview.incompleteAddress + incomplete,
    byCompany: {
      ...preview.byCompany,
      [draft.companyId]: { count: cur.count + 1, reais: cur.reais + draft.valorServicos },
    },
  };
}

async function loadAccount(
  supabase: SupabaseClient,
  accountId: string,
): Promise<PagarmeAccount | null> {
  const { data } = await supabase
    .from("pagarme_accounts")
    .select("id, slug, owner_company_id, organization_id, ambiente")
    .eq("id", accountId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    slug: data.slug as string,
    ownerCompanyId: data.owner_company_id as string,
    organizationId: data.organization_id as string,
    ambiente: data.ambiente as NfseAmbiente,
  };
}

async function failRun(supabase: SupabaseClient, runId: string, reason: string): Promise<void> {
  await supabase
    .from("invoice_backfill_runs")
    .update({ status: "failed", last_error: reason })
    .eq("id", runId);
}

interface PageResult {
  rows: Record<string, unknown>[];
  preview: Preview;
  diagnostics: Diagnostics;
  skipped: number;
}

/** Processa UMA página: hidrata cada cobrança paga e monta linhas + preview + diagnóstico. */
async function processPage(
  supabase: SupabaseClient,
  account: PagarmeAccount,
  apiKey: string,
  run: BackfillRun,
  paidIds: string[],
): Promise<PageResult> {
  const rows: Record<string, unknown>[] = [];
  let preview = emptyPreview();
  const diag = emptyDiagnostics();
  let skipped = 0;

  const sinceMs = Date.parse(run.created_since);
  const untilMs = Date.parse(run.created_until);

  const skip = (reason: string): void => {
    diag.skipReasons[reason] = (diag.skipReasons[reason] ?? 0) + 1;
    skipped += 1;
  };

  for (const id of paidIds) {
    // resiliência: uma cobrança problemática não derruba a página inteira
    try {
      const detail = await fetchChargeDetail(id, apiKey);
      if (!detail) {
        skip("hydrate_failed");
        continue;
      }

      // filtro de janela no cliente (robusto: independe do filtro do servidor)
      const createdAt = typeof detail.created_at === "string" ? Date.parse(detail.created_at) : NaN;
      if (Number.isFinite(createdAt) && (createdAt < sinceMs || createdAt > untilMs)) {
        skip("out_of_window");
        continue;
      }

      const event = parseChargeResource(detail, `backfill:${id}`);
      if (!event) {
        skip("not_paid");
        continue;
      }

      const enriched = await enrichEventAddress(event);
      const { event: finalEvent, splitMeta } = await resolveAuthoritativeSplit(
        supabase,
        account,
        enriched,
        apiKey,
      );
      const ctx = await loadContext(
        supabase,
        account,
        finalEvent.split.map((s) => s.recipientId),
      );
      const { jobs, skipped: jobSkips } = explodeChargePaid(finalEvent, ctx);

      for (const s of jobSkips) {
        skip(s.reason);
        // recebedor não mapeado: registra o re_ para o operador saber o que mapear
        diag.unmappedRecipients[s.recipientId] = (diag.unmappedRecipients[s.recipientId] ?? 0) + 1;
      }

      for (const job of jobs) {
        const withMeta = applySplitMeta(job, splitMeta);
        // backfill nasce SEMPRE em revisão (decisão fiscal) + procedência do run
        const draft: InvoiceJobDraft = {
          ...withMeta,
          status: "pending_review",
          metadata: { ...withMeta.metadata, source: "backfill", backfillRunId: run.id },
        };
        rows.push(toRow(draft));
        preview = tallyDraft(preview, draft);
      }
    } catch (e) {
      skip("charge_error");
      if (diag.pageErrors.length < 20) {
        diag.pageErrors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { rows, preview, diagnostics: diag, skipped };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const provided = req.headers.get("x-worker-secret") ?? url.searchParams.get("secret") ?? "";
  if (WORKER_SECRET && provided !== WORKER_SECRET) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // run mais antigo em processamento (o CAS de cursor evita corrida entre ticks)
  const { data: runRow } = await supabase
    .from("invoice_backfill_runs")
    .select(RUN_COLUMNS)
    .eq("status", "running")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!runRow) return json({ status: "idle" });
  let run = runRow as BackfillRun;

  const account = await loadAccount(supabase, run.pagarme_account_id);
  if (!account) {
    await failRun(supabase, run.id, "conta pagar.me inexistente");
    return json({ status: "failed", runId: run.id, reason: "account_missing" });
  }

  const { data: apiKeyData } = await supabase.rpc("get_pagarme_account_secret", {
    p_account_id: account.id,
  });
  const apiKey = typeof apiKeyData === "string" ? apiKeyData : "";
  if (!apiKey) {
    await failRun(supabase, run.id, "secret key do pagar.me não configurada para a conta");
    return json({ status: "failed", runId: run.id, reason: "no_api_key" });
  }

  let processedPages = 0;
  let done = false;

  try {
    for (let i = 0; i < PAGES_PER_INVOCATION; i += 1) {
      const cursor = run.page_cursor;
      const page = await fetchChargesPage({
        apiKey,
        createdSince: run.created_since,
        createdUntil: run.created_until,
        page: cursor,
        size: run.page_size,
      });

      if (!page) {
        const attempts = run.attempts + 1;
        const terminal = attempts >= MAX_ATTEMPTS;
        await supabase
          .from("invoice_backfill_runs")
          .update({
            attempts,
            status: terminal ? "failed" : "running",
            last_error: `falha ao listar página ${cursor}`,
          })
          .eq("id", run.id);
        return json({ status: terminal ? "failed" : "list_error", runId: run.id, cursor });
      }

      const { rows, preview, diagnostics, skipped } = await processPage(
        supabase,
        account,
        apiKey,
        run,
        page.paidIds,
      );

      let created = 0;
      if (!run.dry_run && rows.length > 0) {
        const { data: inserted, error } = await supabase
          .from("invoice_jobs")
          .upsert(rows, {
            onConflict: "pagarme_charge_id,pagarme_recipient_id",
            ignoreDuplicates: true,
          })
          .select("id");
        if (error) {
          await supabase
            .from("invoice_backfill_runs")
            .update({ last_error: `upsert falhou na página ${cursor}: ${error.message}` })
            .eq("id", run.id);
          return json(
            { status: "upsert_error", runId: run.id, cursor, detail: error.message },
            500,
          );
        }
        created = inserted?.length ?? 0;
      }

      // total conhecido (paging.total). Fim: página vazia OU já vimos tudo.
      const total = run.total_charges ?? page.total;
      const seenAfter = run.charges_seen + page.count;
      const isLastPage = page.count === 0 || (total != null && seenAfter >= total);

      const nextPreview = mergePreview(run.preview ?? emptyPreview(), preview);
      const nextDiag = mergeDiagnostics(run.diagnostics ?? emptyDiagnostics(), diagnostics);

      // CAS otimista: só avança se o cursor não mudou (tick concorrente)
      const { data: advanced } = await supabase
        .from("invoice_backfill_runs")
        .update({
          page_cursor: cursor + 1,
          total_charges: total,
          charges_seen: seenAfter,
          jobs_created: run.jobs_created + created,
          jobs_skipped: run.jobs_skipped + skipped,
          preview: nextPreview,
          diagnostics: nextDiag,
          last_error: null,
          attempts: 0,
          status: isLastPage ? "completed" : "running",
        })
        .eq("id", run.id)
        .eq("page_cursor", cursor)
        .eq("status", "running")
        .select(RUN_COLUMNS)
        .maybeSingle();

      if (!advanced) break; // outro tick avançou este run -> encerra sem duplicar
      run = advanced as BackfillRun;
      processedPages += 1;

      if (isLastPage) {
        done = true;
        break;
      }
    }
  } catch (e) {
    // erro inesperado processando a página -> grava no run (não some como 500 opaco)
    const attempts = run.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    await supabase
      .from("invoice_backfill_runs")
      .update({
        attempts,
        status: terminal ? "failed" : "running",
        last_error: `erro ao processar: ${e instanceof Error ? e.message : String(e)}`,
      })
      .eq("id", run.id);
    return json(
      {
        status: terminal ? "failed" : "error",
        runId: run.id,
        detail: e instanceof Error ? e.message : String(e),
      },
      200,
    );
  }

  return json({
    status: done ? "completed" : "progress",
    runId: run.id,
    dryRun: run.dry_run,
    processedPages,
    cursor: run.page_cursor,
    totalCharges: run.total_charges,
    chargesSeen: run.charges_seen,
    jobsCreated: run.jobs_created,
    jobsSkipped: run.jobs_skipped,
    preview: run.preview,
    diagnostics: run.diagnostics,
  });
});
