/**
 * Aplicação do documento do Focus (recebido por webhook OU obtido por consulta)
 * a um `invoice_jobs`. Fonte ÚNICA da verdade de "status do Focus → job",
 * usada pela `focus-webhook` e pela reconciliação do `nfse-worker`.
 *
 * `mapFocusStatus` é pura (testável por Vitest). `applyFocusDocument` recebe o
 * client Supabase por parâmetro (import type-only, sem dep em runtime no Vitest).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const FOCUS_BASE: Record<string, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

const BUCKET = "nfse-files";

/** Focus status -> invoice_job_status. null = não altera o status do job. */
export function mapFocusStatus(focusStatus: string | null): string | null {
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

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * true quando o corpo do Focus traz um erro REAL (não vazio). É a base para
 * decidir se uma resposta não-2xx do POST é uma rejeição legítima — um corpo
 * vazio (`{}`) NÃO é rejeição (pode ser timeout/dedup e a nota existir no Focus).
 */
export function hasFocusError(body: Record<string, unknown> | null | undefined): boolean {
  if (!body) return false;
  const erros = body.erros;
  const hasErros = Array.isArray(erros)
    ? erros.length > 0
    : erros != null && typeof erros === "object"
      ? Object.keys(erros as Record<string, unknown>).length > 0
      : false;
  return hasErros || typeof body.codigo === "string" || typeof body.mensagem === "string";
}

async function downloadToStorage(
  supabase: SupabaseClient,
  base: string,
  token: string,
  caminho: string,
  destPath: string,
  contentType: string,
): Promise<string | null> {
  const url = caminho.startsWith("http") ? caminho : `${base}${caminho}`;
  const resp = await fetch(url, { headers: { Authorization: `Basic ${btoa(`${token}:`)}` } });
  if (!resp.ok) return null;
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(destPath, bytes, { contentType, upsert: true });
  return error ? null : destPath;
}

export interface FocusJobRef {
  id: string;
  company_id: string;
  ambiente: string;
  focus_ref: string;
}

/**
 * Aplica o documento `doc` (JSON do Focus) ao job: atualiza status/numero/chave/
 * mensagem/erros e, em `autorizado`, baixa XML/DANFSe para o Storage.
 * Retorna o novo status do job (ou null se não mudou).
 */
export async function applyFocusDocument(
  supabase: SupabaseClient,
  job: FocusJobRef,
  doc: Record<string, unknown>,
  token: string | null,
): Promise<string | null> {
  const focusStatus = asString(doc.status);
  const nextStatus = mapFocusStatus(focusStatus);

  const update: Record<string, unknown> = {
    focus_status: focusStatus,
    mensagem_sefaz: asString(doc.mensagem_sefaz),
    erros: doc.erros ?? null,
  };
  if (nextStatus) update.status = nextStatus;
  if (asString(doc.numero)) update.numero_nfse = asString(doc.numero);
  const chave = asString(doc.chave_nfse) ?? asString(doc.codigo_verificacao);
  if (chave) update.chave_nfse = chave;

  if (focusStatus === "autorizado" && token) {
    const base = FOCUS_BASE[job.ambiente] ?? FOCUS_BASE.homologacao;
    const xmlPath = asString(doc.caminho_xml_nota_fiscal);
    const danfsePath = asString(doc.caminho_danfse) ?? asString(doc.caminho_danfe);
    if (xmlPath) {
      const saved = await downloadToStorage(
        supabase,
        base,
        token,
        xmlPath,
        `${job.company_id}/${job.focus_ref}.xml`,
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
        `${job.company_id}/${job.focus_ref}.pdf`,
        "application/pdf",
      );
      if (saved) update.danfse_path = saved;
    }
  }

  await supabase.from("invoice_jobs").update(update).eq("id", job.id);
  return nextStatus;
}
