/**
 * Tipos de domínio da integração NFS-e (Focus × pagar.me).
 *
 * `ChargePaidEvent` é a forma **normalizada** do webhook `charge.paid` do
 * pagar.me (o parsing do payload bruto vive na Edge Function — Fase 2). A
 * lógica de explosão do split opera sobre esta forma, pura e testável.
 *
 * Mora em `_shared` para ser importável pelas Edge Functions (Deno) e pelos
 * testes (Vitest).
 */

export type NfseAmbiente = "homologacao" | "producao";
export type NfseEmissionMode = "manual" | "automatic";
export type InvoiceJobStatus =
  | "pending_review"
  | "approved"
  | "queued"
  | "submitting"
  | "processing_authorization"
  | "authorized"
  | "rejected"
  | "cancelling"
  | "cancelled"
  | "failed";

export type SplitType = "flat" | "percentage";

/** Uma entrada do `split[]` do pagar.me. `amount` em centavos (flat) ou 0–100 (percentage). */
export interface PagarmeSplit {
  recipientId: string; // rp_... / re_...
  amount: number;
  type: SplitType;
}

export interface PagarmeAddress {
  line_1?: string | null;
  line_2?: string | null;
  zip_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface PagarmeCustomer {
  name?: string | null;
  email?: string | null;
  document?: string | null; // CPF/CNPJ
  address?: PagarmeAddress | null;
}

/** Webhook `charge.paid` normalizado. */
export interface ChargePaidEvent {
  eventId: string; // id do webhook (hook_...) — idempotência
  chargeId: string; // ch_...
  amountCents: number; // total da cobrança, em centavos
  planId?: string | null; // plano (não vem no charge.paid; reservado p/ lookup futuro)
  subscriptionId?: string | null; // sub_... (de data.invoice.subscriptionId)
  customer: PagarmeCustomer; // tomador
  split: PagarmeSplit[];
}

export interface RecipientMapEntry {
  pagarmeRecipientId: string;
  companyId: string;
  organizationId: string;
}

export interface ServiceCatalogEntry {
  companyId: string;
  pagarmePlanId?: string | null;
  itemListaServico: string;
  codigoTributarioMunicipio?: string | null;
  aliquotaIss?: number | null;
}

export interface FiscalCompanySettings {
  companyId: string;
  ambiente: NfseAmbiente;
  emissionMode: NfseEmissionMode;
  enabled: boolean;
  itemListaServico?: string | null;
  codigoTributarioMunicipio?: string | null;
  aliquotaIss?: number | null;
}

/** Linha pronta para inserir em `invoice_jobs` (sem campos de default do banco). */
export interface InvoiceJobDraft {
  organizationId: string;
  companyId: string;
  pagarmeChargeId: string;
  pagarmeRecipientId: string;
  ambiente: NfseAmbiente;
  status: InvoiceJobStatus;
  valorServicos: number; // reais — numeric(18,2)
  tomadorDocumento: string | null;
  tomadorNome: string | null;
  tomadorEmail: string | null;
  tomadorEndereco: PagarmeAddress | null;
  itemListaServico: string | null;
  codigoTributarioMunicipio: string | null;
  aliquotaIss: number | null;
  metadata: Record<string, unknown>;
}

export type SkipReason = "recipient_not_mapped";

export interface SkippedSplit {
  recipientId: string;
  reason: SkipReason;
}

export interface ExplodeContext {
  recipients: RecipientMapEntry[];
  services: ServiceCatalogEntry[];
  settings: FiscalCompanySettings[];
}

export interface ExplodeResult {
  jobs: InvoiceJobDraft[];
  skipped: SkippedSplit[];
}
