/**
 * Edge Function: focus-webhook
 *
 * Recebe o webhook de status do Focus NFe (POST com o JSON do documento),
 * grava o evento bruto (idempotente) em `focus_events` e atualiza o
 * `invoice_jobs` correspondente (casado por `focus_ref` = `ref`).
 *
 * Em `autorizado`: baixa XML e DANFSe do Focus (Basic auth com o token da
 * empresa, do Vault) e sobe no Storage `nfse-files/<company_id>/<ref>.{xml,pdf}`.
 *
 * Origem verificada por segredo na URL/header (FOCUS_WEBHOOK_SECRET).
 * Idempotente: dedup por hash do payload em `focus_events.dedup_key`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("FOCUS_WEBHOOK_SECRET") ?? "";

const FOCUS_BASE: Record<string, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

const BUCKET = "nfse-files";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Focus status -> invoice_job_status. null = não mexe no status do job. */
function mapStatus(focusStatus: string | null): string | null {
  switch (focusStatus) {
    case "processando_autorizacao":
      return "processing_authorization";
    case "autorizado":
      return "authorized";
    case "erro_autorizacao":
      return "rejected";
    case "cancelado":
      return "cancelled";
    default:
      return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Baixa um arquivo do Focus (caminho relativo) e sobe no Storage; retorna o path salvo. */
async function downloadToStorage(
  supabase: SupabaseClient,
  base: string,
  token: string,
  caminho: string,
  destPath: string,
  contentType: string,
): Promise<string | null> {
  const url = caminho.startsWith("http") ? caminho : `${base}${caminho}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(`${token}:`)}` },
  });
  if (!resp.ok) return null;
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(destPath, bytes, {
    contentType,
    upsert: true,
  });
  if (error) return null;
  return destPath;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const provided = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const ref = asString(payload.ref);
  const focusStatus = asString(payload.status);
  if (!ref) return json({ error: "missing_ref" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1) ingest idempotente em focus_events
  const dedupKey = await sha256Hex(JSON.stringify(payload));
  const { data: inserted, error: evErr } = await supabase
    .from("focus_events")
    .upsert(
      { focus_ref: ref, status: focusStatus, payload, dedup_key: dedupKey },
      { onConflict: "dedup_key", ignoreDuplicates: true },
    )
    .select("id");
  if (evErr) return json({ error: "focus_event_failed", detail: evErr.message }, 500);
  if (!inserted || inserted.length === 0) {
    return json({ status: "duplicate_ignored", ref });
  }

  // 2) localizar o job pela ref
  const { data: job } = await supabase
    .from("invoice_jobs")
    .select("id, company_id, ambiente, status")
    .eq("focus_ref", ref)
    .maybeSingle();
  if (!job) {
    await markProcessed(supabase, dedupKey, "job_not_found");
    return json({ status: "job_not_found", ref });
  }

  const nextStatus = mapStatus(focusStatus);
  const update: Record<string, unknown> = {
    focus_status: focusStatus,
    mensagem_sefaz: asString(payload.mensagem_sefaz),
    erros: payload.erros ?? null,
  };
  if (nextStatus) update.status = nextStatus;
  if (asString(payload.numero)) update.numero_nfse = asString(payload.numero);
  const chave = asString(payload.chave_nfse) ?? asString(payload.codigo_verificacao);
  if (chave) update.chave_nfse = chave;

  // 3) em autorizado: baixa XML/DANFSe e sobe no Storage
  if (focusStatus === "autorizado") {
    const base = FOCUS_BASE[job.ambiente as string] ?? FOCUS_BASE.homologacao;
    const { data: token } = await supabase.rpc("get_focus_token", {
      p_company_id: job.company_id,
    });
    if (typeof token === "string" && token.length > 0) {
      const xmlPath = asString(payload.caminho_xml_nota_fiscal);
      const danfsePath = asString(payload.caminho_danfse) ?? asString(payload.caminho_danfe);
      const company = job.company_id as string;
      if (xmlPath) {
        const saved = await downloadToStorage(
          supabase,
          base,
          token,
          xmlPath,
          `${company}/${ref}.xml`,
          "application/xml",
        );
        if (saved) update.xml_path = saved;
      }
      if (danfsePath) {
        const saved = await downloadToStorage(
          supabase,
          base,
          token,
          danfsePath,
          `${company}/${ref}.pdf`,
          "application/pdf",
        );
        if (saved) update.danfse_path = saved;
      }
    }
  }

  const { error: upErr } = await supabase.from("invoice_jobs").update(update).eq("id", job.id);
  if (upErr) return json({ error: "job_update_failed", detail: upErr.message }, 500);

  await markProcessed(supabase, dedupKey);
  return json({ status: "processed", ref, jobStatus: nextStatus ?? (job.status as string) });
});

async function markProcessed(
  supabase: SupabaseClient,
  dedupKey: string,
  note?: string,
): Promise<void> {
  await supabase
    .from("focus_events")
    .update({ processed_at: new Date().toISOString(), process_error: note ?? null })
    .eq("dedup_key", dedupKey);
}
