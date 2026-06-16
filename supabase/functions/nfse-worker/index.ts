/**
 * Edge Function: nfse-worker
 *
 * Drena a fila de NFS-e: reivindica jobs `queued` (RPC claim_nfse_jobs, com
 * FOR UPDATE SKIP LOCKED), monta o payload (buildNfsePayload), lê o token do
 * Focus do Vault (RPC get_focus_token) e emite via `POST /v2/nfse?ref=`.
 *
 * Acionada por pg_cron (agendado) ou manualmente (POST). Idempotente por job:
 * a `focus_ref` é única; reenviar com a mesma ref é seguro no Focus.
 *
 * Resultado:
 *   202/200/201 -> job 'processing_authorization' (aguarda webhook do Focus)
 *   422/erro     -> job 'rejected' (mensagem_sefaz/erros preenchidos)
 *   exceção/5xx  -> volta para 'queued' com backoff (next_attempt_at)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildNfsePayload } from "../_shared/nfse/payload.ts";
import type { PagarmeAddress } from "../_shared/nfse/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORKER_SECRET = Deno.env.get("NFSE_WORKER_SECRET") ?? "";
const MAX_ATTEMPTS = 5;

const FOCUS_BASE: Record<string, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

interface InvoiceJobRow {
  id: string;
  company_id: string;
  ambiente: string;
  focus_ref: string;
  valor_servicos: number | string;
  tomador_documento: string | null;
  tomador_nome: string | null;
  tomador_email: string | null;
  tomador_endereco: PagarmeAddress | null;
  item_lista_servico: string | null;
  codigo_tributario_municipio: string | null;
  aliquota_iss: number | null;
  attempts: number;
  metadata: Record<string, unknown> | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function backoffMinutes(attempts: number): number {
  // 1, 3, 9, 27... minutos (cap em ~3h)
  return Math.min(3 ** Math.max(attempts - 1, 0), 180);
}

async function emitJob(
  supabase: SupabaseClient,
  job: InvoiceJobRow,
): Promise<{ id: string; http?: number; status: string }> {
  const [{ data: company }, { data: settings }, { data: token }] = await Promise.all([
    supabase.from("companies").select("cnpj").eq("id", job.company_id).single(),
    supabase
      .from("fiscal_company_settings")
      .select("inscricao_municipal, municipio_ibge, optante_simples")
      .eq("company_id", job.company_id)
      .single(),
    supabase.rpc("get_focus_token", { p_company_id: job.company_id }),
  ]);

  if (!token) {
    await supabase
      .from("invoice_jobs")
      .update({ status: "rejected", mensagem_sefaz: "Token do Focus não configurado" })
      .eq("id", job.id);
    return { id: job.id, status: "rejected_no_token" };
  }

  const discriminacao =
    (job.metadata?.discriminacao as string | undefined) ?? "Prestação de serviço";

  const payload = buildNfsePayload({
    dataEmissao: new Date().toISOString(),
    prestador: {
      cnpj: (company?.cnpj as string | null) ?? "",
      inscricaoMunicipal: (settings?.inscricao_municipal as string | null) ?? null,
      municipioIbge: (settings?.municipio_ibge as string | null) ?? "3505708",
      optanteSimples: (settings?.optante_simples as boolean | null) ?? null,
    },
    tomador: {
      documento: job.tomador_documento,
      nome: job.tomador_nome,
      email: job.tomador_email,
      endereco: job.tomador_endereco,
    },
    servico: {
      valorServicos: Number(job.valor_servicos),
      itemListaServico: job.item_lista_servico,
      codigoTributarioMunicipio: job.codigo_tributario_municipio,
      aliquotaIss: job.aliquota_iss,
      discriminacao,
    },
  });

  const base = FOCUS_BASE[job.ambiente] ?? FOCUS_BASE.homologacao;
  const res = await fetch(`${base}/v2/nfse?ref=${encodeURIComponent(job.focus_ref)}`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${token}:`),
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const focusBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.status === 200 || res.status === 201 || res.status === 202) {
    await supabase
      .from("invoice_jobs")
      .update({
        status: "processing_authorization",
        focus_status: (focusBody.status as string | undefined) ?? null,
      })
      .eq("id", job.id);
    return { id: job.id, http: res.status, status: "processing_authorization" };
  }

  // rejeição (422 etc.)
  await supabase
    .from("invoice_jobs")
    .update({
      status: "rejected",
      focus_status: (focusBody.status as string | undefined) ?? null,
      mensagem_sefaz: (focusBody.mensagem as string | undefined) ?? null,
      erros: focusBody,
    })
    .eq("id", job.id);
  return { id: job.id, http: res.status, status: "rejected" };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const provided = req.headers.get("x-worker-secret") ?? url.searchParams.get("secret") ?? "";
  if (WORKER_SECRET && provided !== WORKER_SECRET) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: jobs, error } = await supabase.rpc("claim_nfse_jobs", { p_limit: 20 });
  if (error) return json({ error: "claim_failed", detail: error.message }, 500);

  const results: Array<{ id: string; http?: number; status: string }> = [];
  for (const job of (jobs ?? []) as InvoiceJobRow[]) {
    try {
      results.push(await emitJob(supabase, job));
    } catch (e) {
      const attempts = job.attempts ?? 1;
      const next = new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString();
      const terminal = attempts >= MAX_ATTEMPTS;
      await supabase
        .from("invoice_jobs")
        .update({
          status: terminal ? "failed" : "queued",
          next_attempt_at: terminal ? null : next,
          erros: { worker_error: String(e) },
        })
        .eq("id", job.id);
      results.push({ id: job.id, status: terminal ? "failed" : "retry_scheduled" });
    }
  }

  return json({ claimed: (jobs ?? []).length, results });
});
