/**
 * nfse-cancel — cancelamento de NFS-e no Focus, nota por nota.
 *
 * Existe por causa das 21 NFS-e duplicadas emitidas em produção (bug da chave de
 * idempotência por recebedor, corrigido na migration 20260819141651). O sistema
 * sabia OBSERVAR cancelamento; não sabia pedir.
 *
 * Cancelamento é DEFINITIVO e sai do sistema (prefeitura). Por isso:
 *   · só super_admin chama;
 *   · `dryRun: true` (o DEFAULT) valida tudo e não toca no Focus;
 *   · lote pequeno e explícito — nunca "cancele o que casar com o filtro";
 *   · o que é ambíguo vira `cancelling` e o reconcile do nfse-worker decide
 *     consultando o Focus, em vez de gravar palpite;
 *   · a justificativa fica no metadata do job com autor e horário.
 *
 * Contrato: POST { jobIds: string[], justificativa: string, dryRun?: boolean }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  assertCancelable,
  focusCancelPath,
  interpretCancelResponse,
  normalizeJustificativa,
  type CancelableJob,
} from "../_shared/nfse/cancel.ts";
import { applyFocusDocument, FOCUS_BASE } from "../_shared/nfse/focus.ts";

/** Teto do lote: cancelamento é irreversível, então nada de rodar 500 de uma vez. */
const MAX_LOTE = 25;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface Payload {
  jobIds?: unknown;
  justificativa?: unknown;
  dryRun?: unknown;
}

interface JobRow extends CancelableJob {
  company_id: string;
  ambiente: string;
  valor_servicos: string | number | null;
  tomador_nome: string | null;
  metadata: Record<string, unknown> | null;
}

interface Resultado {
  jobId: string;
  numero: string | null;
  outcome: string;
  detail?: string | null;
}

async function cancelarUm(
  supabase: SupabaseClient,
  job: JobRow,
  justificativa: string,
  autorId: string,
): Promise<Resultado> {
  const base = FOCUS_BASE[job.ambiente] ?? FOCUS_BASE.homologacao;
  const { data: token } = await supabase.rpc("get_focus_token", { p_company_id: job.company_id });
  if (typeof token !== "string" || token.length === 0) {
    return { jobId: job.id, numero: job.numero_nfse, outcome: "erro", detail: "sem_token_focus" };
  }

  let httpStatus = 0;
  let body: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${base}${focusCancelPath(job.focus_ref as string)}`, {
      method: "DELETE",
      headers: {
        Authorization: "Basic " + btoa(`${token}:`),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ justificativa }),
    });
    httpStatus = res.status;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      body = null; // corpo ilegível -> ambíguo, tratado abaixo
    }
  } catch (e) {
    // a rede caiu: o pedido PODE ter chegado. Nunca assumir que não.
    httpStatus = 0;
    body = null;
    const detalhe = e instanceof Error ? e.message : String(e);
    await marcarCancelling(supabase, job, justificativa, autorId, `rede: ${detalhe}`);
    return { jobId: job.id, numero: job.numero_nfse, outcome: "ambiguous", detail: detalhe };
  }

  const interp = interpretCancelResponse(httpStatus, body);

  if (interp.outcome === "ambiguous") {
    await marcarCancelling(supabase, job, justificativa, autorId, interp.detail);
    return { jobId: job.id, numero: job.numero_nfse, outcome: "ambiguous", detail: interp.detail };
  }

  // fonte ÚNICA de "status do Focus -> job": não gravamos status na mão aqui
  if (interp.doc) {
    await applyFocusDocument(
      supabase,
      {
        id: job.id,
        company_id: job.company_id,
        ambiente: job.ambiente,
        focus_ref: job.focus_ref as string,
      },
      interp.doc,
      token,
    );
  }

  await gravarTrilha(supabase, job, justificativa, autorId, interp.outcome, interp.detail);
  return {
    jobId: job.id,
    numero: job.numero_nfse,
    outcome: interp.outcome,
    detail: interp.detail,
  };
}

/** Ambiguidade -> `cancelling`: o reconcile do nfse-worker resolve consultando. */
async function marcarCancelling(
  supabase: SupabaseClient,
  job: JobRow,
  justificativa: string,
  autorId: string,
  detalhe: string | null,
): Promise<void> {
  await supabase
    .from("invoice_jobs")
    .update({
      status: "cancelling",
      metadata: trilha(job, justificativa, autorId, "ambiguous", detalhe),
    })
    .eq("id", job.id);
}

async function gravarTrilha(
  supabase: SupabaseClient,
  job: JobRow,
  justificativa: string,
  autorId: string,
  outcome: string,
  detalhe: string | null,
): Promise<void> {
  await supabase
    .from("invoice_jobs")
    .update({ metadata: trilha(job, justificativa, autorId, outcome, detalhe) })
    .eq("id", job.id);
}

function trilha(
  job: JobRow,
  justificativa: string,
  autorId: string,
  outcome: string,
  detalhe: string | null,
): Record<string, unknown> {
  return {
    ...(job.metadata ?? {}),
    cancelamento: {
      justificativa,
      solicitadoPor: autorId,
      solicitadoEm: new Date().toISOString(),
      outcome,
      detail: detalhe,
    },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey)
    return json({ error: "server_misconfigured" }, 500);

  // quem chama: precisa ser super_admin (documento fiscal, ação irreversível)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: callerUser, error: userErr } = await caller.auth.getUser();
  if (userErr || !callerUser?.user) return json({ error: "unauthorized" }, 401);

  const { data: profile } = await caller
    .from("profiles")
    .select("role")
    .eq("id", callerUser.user.id)
    .maybeSingle();
  if (profile?.role !== "super_admin") return json({ error: "forbidden" }, 403);

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const jobIds = Array.isArray(payload.jobIds)
    ? payload.jobIds.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
  if (jobIds.length === 0) return json({ error: "job_ids_obrigatorio" }, 400);
  if (jobIds.length > MAX_LOTE) {
    return json({ error: "lote_grande", max: MAX_LOTE, recebido: jobIds.length }, 400);
  }

  const just = normalizeJustificativa(payload.justificativa);
  if (!just.ok) return json({ error: just.error }, 400);

  // dryRun é o DEFAULT: só executa quem pedir explicitamente `dryRun: false`
  const dryRun = payload.dryRun !== false;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error: readErr } = await admin
    .from("invoice_jobs")
    .select(
      "id, company_id, ambiente, document_type, status, focus_ref, numero_nfse, valor_servicos, tomador_nome, metadata",
    )
    .in("id", jobIds);
  if (readErr) return json({ error: "leitura_falhou", detail: readErr.message }, 500);

  const encontrados = (rows ?? []) as JobRow[];
  const resultados: Resultado[] = [];
  const plano: Array<Record<string, unknown>> = [];

  for (const id of jobIds) {
    const job = encontrados.find((j) => j.id === id);
    if (!job) {
      resultados.push({ jobId: id, numero: null, outcome: "erro", detail: "job_inexistente" });
      continue;
    }
    const check = assertCancelable(job);
    if (!check.ok) {
      resultados.push({ jobId: id, numero: job.numero_nfse, outcome: "erro", detail: check.error });
      continue;
    }
    plano.push({
      jobId: job.id,
      numero: job.numero_nfse,
      tomador: job.tomador_nome,
      valor: job.valor_servicos,
      ambiente: job.ambiente,
      focusRef: job.focus_ref,
    });
  }

  if (dryRun) {
    return json({
      dryRun: true,
      justificativa: just.value,
      cancelariam: plano.length,
      plano,
      recusados: resultados,
      aviso: "nada foi enviado ao Focus; repita com dryRun: false para executar",
    });
  }

  for (const item of plano) {
    const job = encontrados.find((j) => j.id === item.jobId) as JobRow;
    resultados.push(await cancelarUm(admin, job, just.value, callerUser.user.id));
  }

  return json({
    dryRun: false,
    justificativa: just.value,
    total: resultados.length,
    cancelled: resultados.filter((r) => r.outcome === "cancelled").length,
    refused: resultados.filter((r) => r.outcome === "refused").length,
    ambiguous: resultados.filter((r) => r.outcome === "ambiguous").length,
    erros: resultados.filter((r) => r.outcome === "erro").length,
    resultados,
  });
});
