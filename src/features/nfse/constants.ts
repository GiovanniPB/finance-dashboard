import type { NfseAmbiente, NfseEmissionMode } from "./api";

/** Tons aceitos pelo componente Badge. */
export type BadgeTone = "default" | "accent" | "income" | "expense" | "warning" | "info";

export type FiscalDocumentType = "nfse" | "nfe";

export const DOCUMENT_TYPE_OPTIONS: { value: FiscalDocumentType; label: string }[] = [
  { value: "nfse", label: "NFS-e (serviço)" },
  { value: "nfe", label: "NF-e (produto)" },
];

export const DOCUMENT_TYPE_META: Record<FiscalDocumentType, { label: string; tone: BadgeTone }> = {
  nfse: { label: "NFS-e", tone: "info" },
  nfe: { label: "NF-e", tone: "accent" },
};

/** Regime tributário do emitente (NF-e). */
export const REGIME_TRIBUTARIO_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 — Simples Nacional" },
  { value: 2, label: "2 — Simples (excesso sublimite)" },
  { value: 3, label: "3 — Regime Normal" },
];

export const AMBIENTE_OPTIONS: { value: NfseAmbiente; label: string }[] = [
  { value: "homologacao", label: "Homologação" },
  { value: "producao", label: "Produção" },
];

export const EMISSION_MODE_OPTIONS: { value: NfseEmissionMode; label: string }[] = [
  { value: "manual", label: "Manual (revisão)" },
  { value: "automatic", label: "Automático" },
];

export const AMBIENTE_META: Record<NfseAmbiente, { label: string; tone: BadgeTone }> = {
  homologacao: { label: "Homologação", tone: "warning" },
  producao: { label: "Produção", tone: "income" },
};

/** Status dos invoice_jobs — rótulo + tom para a fila de notas. */
export const JOB_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  pending_review: { label: "Revisão", tone: "warning" },
  approved: { label: "Aprovada", tone: "info" },
  queued: { label: "Na fila", tone: "info" },
  submitting: { label: "Enviando", tone: "info" },
  processing_authorization: { label: "Processando", tone: "info" },
  authorized: { label: "Autorizada", tone: "income" },
  rejected: { label: "Rejeitada", tone: "expense" },
  cancelling: { label: "Cancelando", tone: "warning" },
  cancelled: { label: "Cancelada", tone: "default" },
  failed: { label: "Falhou", tone: "expense" },
};

/** Agrupamentos de status para o filtro da fila de notas. `statuses: null` = todas. */
export const JOB_STATUS_FILTERS: { value: string; label: string; statuses: string[] | null }[] = [
  { value: "review", label: "Aguardando revisão", statuses: ["pending_review"] },
  {
    value: "processing",
    label: "Em processamento",
    statuses: ["approved", "queued", "submitting", "processing_authorization"],
  },
  { value: "authorized", label: "Autorizadas", statuses: ["authorized"] },
  { value: "problem", label: "Com erro", statuses: ["rejected", "failed"] },
  { value: "all", label: "Todas", statuses: null },
];

/** URL pública da Edge Function de webhook para uma conta (slug + segredo opcional). */
export function webhookUrl(slug: string, secret?: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const url = `${base}/functions/v1/pagarme-webhook?account=${encodeURIComponent(slug)}`;
  return secret ? `${url}&secret=${encodeURIComponent(secret)}` : url;
}
