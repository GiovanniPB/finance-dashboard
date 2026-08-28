/**
 * Edge Function: pagarme-sync
 *
 * Mantém o ledger de vendas em dia com a API do pagar.me. Acionada por pg_cron
 * (ver `pagarme_cron_invoke`) ou manualmente, protegida por segredo compartilhado
 * no header `x-sync-secret`.
 *
 * Quatro modos (`?mode=`):
 *
 *  - `settlements` (horário) — VIA PRIMÁRIA de realização. Lê
 *    `/balance/operations`, que devolve o payable liquidado dentro de
 *    `movement_object` e pagina de verdade. Marca os recebíveis como `paid`.
 *
 *  - `maturity` (diário) — REDE DE SEGURANÇA. Reconsulta `/payables?charge_id=`
 *    das cobranças cujo recebível já venceu e continua `waiting_funds`. É por
 *    aqui que antecipação (muda a data + gera custo) e estorno aparecem. Existe
 *    porque o `/payables` global tem paginação quebrada — não há varredura.
 *
 *  - `subscriptions` (diário) — status/cancelamento das assinaturas (MRR/churn).
 *    Conta sem assinatura devolve página vazia: caso NORMAL, não erro.
 *
 *  - `backfill` (a cada 2 min, no-op sem lote) — drena `pagarme_sync_runs`:
 *    enumera `/charges` por janela, resumível por cursor de página. Um lote
 *    disparado pela UI se drena sozinho.
 *
 * Wrapper fino: parsing puro em `_shared/pagarme/*`, escrita em `writer.ts`.
 * Nenhum modo é destrutivo — tudo é upsert idempotente por chave natural, então
 * repetir um tick é seguro.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  fetchBalanceOperationsPage,
  fetchChargesPage,
  fetchSubscriptionsPage,
} from "../_shared/pagarme/api.ts";
import {
  loadLedgerContext,
  syncChargePayables,
  writeCharge,
  writeCustomer,
  writeReceivables,
  writeSubscription,
  type LedgerContext,
} from "../_shared/pagarme/writer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_SECRET = Deno.env.get("PAGARME_SYNC_SECRET") ?? "";

/**
 * Orçamentos por invocação — o Edge Runtime tem limite de tempo/CPU, então cada
 * tick faz um pedaço e o cron continua. Todos os modos são retomáveis.
 */
const SETTLEMENT_PAGES = 3; // páginas de /balance/operations por conta
const MATURITY_CHARGES = 40; // cobranças reconsultadas por conta
const SUBSCRIPTION_PAGES = 4; // páginas de /subscriptions por conta
const BACKFILL_PAGES = 2; // páginas de /charges por lote (hidratação é cara)
const MAX_RUN_ATTEMPTS = 8;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface SyncAccount {
  id: string;
  slug: string;
}

/** Contas ativas COM secret key (sem chave não há o que consultar). */
async function loadAccounts(supabase: SupabaseClient): Promise<SyncAccount[]> {
  const { data } = await supabase.rpc("pagarme_active_sync_accounts");
  return (data ?? []) as SyncAccount[];
}

async function apiKeyFor(supabase: SupabaseClient, accountId: string): Promise<string | null> {
  const { data } = await supabase.rpc("get_pagarme_account_secret", { p_account_id: accountId });
  return typeof data === "string" && data.length > 0 ? data : null;
}

// ---------------------------------------------------------------------------
// modo: settlements
// ---------------------------------------------------------------------------

async function runSettlements(
  supabase: SupabaseClient,
  ctx: LedgerContext,
  apiKey: string,
): Promise<Record<string, unknown>> {
  let written = 0;
  let pages = 0;
  const unmapped = new Set<string>();

  for (let page = 1; page <= SETTLEMENT_PAGES; page += 1) {
    const result = await fetchBalanceOperationsPage(apiKey, page);
    if (!result) return { error: "balance_operations_fetch_failed", page, written };
    pages += 1;
    // `count` é o total BRUTO de operações; zero significa fim da paginação.
    // `payables` pode vir vazio numa página cheia de operações de outro tipo —
    // nesse caso seguimos para a próxima em vez de parar.
    if (result.count === 0) break;

    if (result.payables.length > 0) {
      const res = await writeReceivables(supabase, ctx, result.payables);
      written += res.written;
      for (const r of res.unmappedRecipients) unmapped.add(r);
    }
  }

  return {
    written,
    pages,
    ...(unmapped.size > 0 ? { unmappedRecipients: [...unmapped] } : {}),
  };
}

// ---------------------------------------------------------------------------
// modo: maturity
// ---------------------------------------------------------------------------

async function runMaturity(
  supabase: SupabaseClient,
  ctx: LedgerContext,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabase.rpc("pagarme_charges_needing_maturity_sync", {
    p_account_id: ctx.account.id,
    p_limit: MATURITY_CHARGES,
  });
  const chargeIds = ((data ?? []) as { pagarme_charge_id: string }[]).map(
    (r) => r.pagarme_charge_id,
  );

  let written = 0;
  let failed = 0;
  const unmapped = new Set<string>();

  for (const chargeId of chargeIds) {
    const res = await syncChargePayables(supabase, ctx, chargeId, apiKey);
    if (res.status === "fetch_failed") failed += 1;
    written += res.written;
    for (const r of res.unmappedRecipients) unmapped.add(r);
  }

  return {
    checked: chargeIds.length,
    written,
    ...(failed > 0 ? { failed } : {}),
    ...(unmapped.size > 0 ? { unmappedRecipients: [...unmapped] } : {}),
  };
}

// ---------------------------------------------------------------------------
// modo: subscriptions
// ---------------------------------------------------------------------------

async function runSubscriptions(
  supabase: SupabaseClient,
  ctx: LedgerContext,
  apiKey: string,
): Promise<Record<string, unknown>> {
  let written = 0;

  for (let page = 1; page <= SUBSCRIPTION_PAGES; page += 1) {
    const result = await fetchSubscriptionsPage(apiKey, page);
    if (!result) return { error: "subscriptions_fetch_failed", page, written };
    // conta sem assinatura (o caso da RCO) termina aqui, sem erro
    if (result.count === 0) break;

    for (const sub of result.subscriptions) {
      await writeSubscription(supabase, ctx, sub);
      written += 1;
    }
    if (!result.hasNext) break;
  }

  return { written };
}

// ---------------------------------------------------------------------------
// modo: backfill (drena pagarme_sync_runs)
// ---------------------------------------------------------------------------

interface SyncRun {
  id: string;
  pagarme_account_id: string;
  resource: string;
  window_start: string;
  window_end: string;
  page_cursor: number;
  items_seen: number;
  items_written: number;
  items_skipped: number;
  attempts: number;
  dry_run: boolean;
}

async function runBackfill(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: claimed } = await supabase.rpc("claim_pagarme_sync_run");
  const runs = (claimed ?? []) as SyncRun[];
  if (runs.length === 0) return { status: "idle" };

  const run = runs[0];
  // `attempts` é reivindicação SEM PROGRESSO: o tick que avança zera o contador
  // no fim desta função. Sem esse reset o contador viraria "ticks totais" e todo
  // lote com mais de 2×MAX páginas morreria no meio, mesmo indo bem.
  if (run.attempts > MAX_RUN_ATTEMPTS) {
    await supabase
      .from("pagarme_sync_runs")
      .update({ status: "failed", last_error: "max_attempts_exceeded" })
      .eq("id", run.id);
    return { status: "failed", runId: run.id, reason: "max_attempts" };
  }

  const ctx = await loadLedgerContext(supabase, { accountId: run.pagarme_account_id });
  const apiKey = await apiKeyFor(supabase, run.pagarme_account_id);
  if (!ctx || !apiKey) {
    await supabase
      .from("pagarme_sync_runs")
      .update({ status: "failed", last_error: "account_or_key_unavailable" })
      .eq("id", run.id);
    return { status: "failed", runId: run.id, reason: "account_or_key_unavailable" };
  }

  let cursor = run.page_cursor;
  let seen = run.items_seen;
  let written = run.items_written;
  let skipped = run.items_skipped;
  let done = false;

  for (let i = 0; i < BACKFILL_PAGES; i += 1) {
    const page = await fetchChargesPage({
      apiKey,
      page: cursor,
      createdSince: run.window_start,
      createdUntil: run.window_end,
    });

    if (!page) {
      // falha de rede: devolve o run para a fila sem avançar o cursor
      await supabase
        .from("pagarme_sync_runs")
        .update({ page_cursor: cursor, last_error: "charges_fetch_failed" })
        .eq("id", run.id);
      return { status: "retry", runId: run.id, cursor };
    }

    seen += page.count;
    if (page.count === 0) {
      done = true;
      break;
    }

    for (const charge of page.charges) {
      if (run.dry_run) {
        skipped += 1;
        continue;
      }
      await writeCharge(supabase, ctx, charge);
      await writeCustomer(supabase, ctx, charge);
      written += 1;

      // cronograma só existe para venda paga
      if (charge.status === "paid") {
        await syncChargePayables(supabase, ctx, charge.chargeId, apiKey);
      }
    }

    cursor += 1;
    if (!page.hasNext) {
      done = true;
      break;
    }
  }

  await supabase
    .from("pagarme_sync_runs")
    .update({
      page_cursor: cursor,
      items_seen: seen,
      items_written: written,
      items_skipped: skipped,
      last_error: null,
      // o lote avançou: o orçamento de tentativas volta ao início, senão um
      // histórico longo (que precisa de dezenas de ticks) seria abortado como se
      // estivesse travado
      attempts: 0,
      status: done ? "completed" : "running",
    })
    .eq("id", run.id);

  return { status: done ? "completed" : "running", runId: run.id, cursor, seen, written, skipped };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const provided = req.headers.get("x-sync-secret") ?? url.searchParams.get("secret") ?? "";
  if (!SYNC_SECRET || provided !== SYNC_SECRET) return json({ error: "unauthorized" }, 401);

  const mode = url.searchParams.get("mode") ?? "settlements";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // backfill é dirigido por lote (a conta vem do run), não pelo laço de contas
  if (mode === "backfill") {
    return json({ mode, ...(await runBackfill(supabase)) });
  }

  const accounts = await loadAccounts(supabase);
  const results: Record<string, unknown> = {};

  for (const account of accounts) {
    const ctx = await loadLedgerContext(supabase, { accountId: account.id });
    const apiKey = await apiKeyFor(supabase, account.id);
    if (!ctx || !apiKey) {
      results[account.slug] = { error: "account_or_key_unavailable" };
      continue;
    }

    try {
      if (mode === "settlements") {
        results[account.slug] = await runSettlements(supabase, ctx, apiKey);
      } else if (mode === "maturity") {
        results[account.slug] = await runMaturity(supabase, ctx, apiKey);
      } else if (mode === "subscriptions") {
        results[account.slug] = await runSubscriptions(supabase, ctx, apiKey);
      } else {
        return json({ error: "unknown_mode", mode }, 400);
      }
    } catch (err) {
      // uma conta com problema não impede as outras
      results[account.slug] = {
        error: err instanceof Error ? err.message : "sync_failed",
      };
    }
  }

  return json({ mode, accounts: accounts.length, results });
});
