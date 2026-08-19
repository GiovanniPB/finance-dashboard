/**
 * Cancelamento de NFS-e no Focus — parte PURA (testada por Vitest).
 *
 * Contrato do Focus (doc.focusnfe.com.br/reference/cancelar_nfse):
 *   DELETE /v2/nfse/{referencia}   corpo: {"justificativa": "..."} (15–255 chars)
 *   200 {"status":"cancelado"}                  -> cancelada
 *   200 {"status":"erro_cancelamento","erros":[]} -> a prefeitura recusou
 *   400 nota não autorizada · 404 nota inexistente
 *
 * "O cancelamento é definitivo e não pode ser desfeito" — por isso toda decisão
 * de interpretação aqui é conservadora: o que não é sucesso EXPLÍCITO nunca é
 * tratado como sucesso, e o que é ambíguo (rede caiu, corpo vazio) vira
 * `ambiguous`, que leva o job a `cancelling` para o reconcile decidir
 * consultando o Focus — nunca a um palpite local.
 *
 * NF-e NÃO passa por aqui: contrato diferente, síncrono e com prazo de 24h após
 * a emissão. `assertCancelable` recusa explicitamente.
 */

import type { FiscalDocumentType } from "./types.ts";

export const JUSTIFICATIVA_MIN = 15;
export const JUSTIFICATIVA_MAX = 255;

/** Caminho de CANCELAMENTO no Focus (DELETE), relativo à base do ambiente. */
export function focusCancelPath(ref: string): string {
  return `/v2/nfse/${encodeURIComponent(ref)}`;
}

/**
 * Normaliza e valida a justificativa exigida pelo Focus/prefeitura.
 * Espaço colapsado antes de medir: "   " não é justificativa de 3 caracteres.
 */
export function normalizeJustificativa(
  input: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") {
    return { ok: false, error: "justificativa_obrigatoria" };
  }
  const value = input.replace(/\s+/gu, " ").trim();
  if (value.length < JUSTIFICATIVA_MIN) {
    return { ok: false, error: `justificativa_curta_min_${JUSTIFICATIVA_MIN}` };
  }
  if (value.length > JUSTIFICATIVA_MAX) {
    return { ok: false, error: `justificativa_longa_max_${JUSTIFICATIVA_MAX}` };
  }
  return { ok: true, value };
}

export interface CancelableJob {
  id: string;
  document_type: FiscalDocumentType | null;
  status: string;
  focus_ref: string | null;
  numero_nfse: string | null;
}

/** Recusa tudo que não é NFS-e autorizada com ref — antes de tocar na rede. */
export function assertCancelable(job: CancelableJob): { ok: true } | { ok: false; error: string } {
  if ((job.document_type ?? "nfse") !== "nfse") {
    // NF-e tem contrato próprio e prazo de 24h: não é suportado aqui de propósito
    return { ok: false, error: "document_type_nao_suportado" };
  }
  if (job.status !== "authorized") {
    // o Focus devolve 400 nesse caso; barrar antes evita chamada inútil
    return { ok: false, error: `status_nao_cancelavel_${job.status}` };
  }
  if (!job.focus_ref) return { ok: false, error: "sem_focus_ref" };
  return { ok: true };
}

export type CancelOutcome =
  | "cancelled" // Focus confirmou: status 'cancelado'
  | "refused" // prefeitura recusou: 'erro_cancelamento' ou 400
  | "not_found" // 404: nota não existe no Focus
  | "ambiguous"; // sem resposta interpretável -> reconcile decide

export interface CancelInterpretation {
  outcome: CancelOutcome;
  /** Corpo a repassar a `applyFocusDocument` (fonte única de status -> job). */
  doc: Record<string, unknown> | null;
  detail: string | null;
}

/**
 * Traduz a resposta do Focus. Só `status === "cancelado"` é sucesso; qualquer
 * outra coisa é recusa, inexistência ou ambiguidade.
 */
export function interpretCancelResponse(
  httpStatus: number,
  body: Record<string, unknown> | null,
): CancelInterpretation {
  const focusStatus = typeof body?.status === "string" ? body.status : null;

  if (focusStatus === "cancelado") {
    return { outcome: "cancelled", doc: body, detail: null };
  }
  if (focusStatus === "erro_cancelamento") {
    return { outcome: "refused", doc: body, detail: "erro_cancelamento" };
  }
  if (httpStatus === 404) {
    return { outcome: "not_found", doc: null, detail: "nota_inexistente_no_focus" };
  }
  if (httpStatus === 400) {
    return { outcome: "refused", doc: body, detail: "nota_nao_autorizada" };
  }
  // 2xx sem status reconhecível, 5xx, corpo ilegível: NÃO decide localmente
  return { outcome: "ambiguous", doc: null, detail: `http_${httpStatus}` };
}
