import type { NfseAmbiente, NfseEmissionMode } from "./api";

export const AMBIENTE_OPTIONS: { value: NfseAmbiente; label: string }[] = [
  { value: "homologacao", label: "Homologação" },
  { value: "producao", label: "Produção" },
];

export const EMISSION_MODE_OPTIONS: { value: NfseEmissionMode; label: string }[] = [
  { value: "manual", label: "Manual (revisão)" },
  { value: "automatic", label: "Automático" },
];

export const AMBIENTE_META: Record<NfseAmbiente, { label: string; tone: "warning" | "income" }> = {
  homologacao: { label: "Homologação", tone: "warning" },
  producao: { label: "Produção", tone: "income" },
};

/** Status dos invoice_jobs — metadados para a futura fila de notas (Fase 4b). */
export const JOB_STATUS_META: Record<string, { label: string; tone: string }> = {
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

/** URL pública da Edge Function de webhook para uma conta (slug). */
export function webhookUrl(slug: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  return `${base}/functions/v1/pagarme-webhook?account=${encodeURIComponent(slug)}`;
}
