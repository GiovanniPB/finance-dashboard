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

/**
 * Tipo de documento fiscal emitido. O motor é multi-documento: cada empresa
 * declara o seu tipo no perfil fiscal e o `explodeChargePaid`/worker roteia para
 * o builder + endpoint Focus correto. Aberto para extensão (nfce, nfse_nacional…).
 */
export type FiscalDocumentType = "nfse" | "nfe";
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

/**
 * Enriquecimento de endereço pelo CEP (ViaCEP). O pagar.me não estrutura o
 * endereço; o fetch HTTP é feito no webhook e o resultado é "carimbado" em
 * `PagarmeAddress.cep_info` — assim `enrichTomadorAddress` (puro) o usa sem I/O.
 */
export interface CepInfo {
  logradouro?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  ibge?: string | null; // código IBGE do município (codigo_municipio na NFS-e)
}

export interface PagarmeAddress {
  line_1?: string | null;
  line_2?: string | null;
  zip_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  cep_info?: CepInfo | null; // enriquecimento ViaCEP (preenchido no webhook)
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
  chargeCreatedAt: string | null; // ISO UTC — quando a cobrança foi criada (a compra)
  paidAt: string | null; // ISO UTC — quando foi paga (o fato que gera a nota)
  planId?: string | null; // plano (não vem no charge.paid; reservado p/ lookup futuro)
  subscriptionId?: string | null; // sub_... (de data.invoice.subscriptionId)
  customer: PagarmeCustomer; // tomador
  split: PagarmeSplit[];
}

/** Conta pagar.me (conexão). Resolvida pela Edge Function a partir do slug na URL. */
export interface PagarmeAccount {
  id: string;
  slug: string;
  ownerCompanyId: string; // empresa dona — fallback p/ cobrança sem split
  organizationId: string;
  ambiente: NfseAmbiente;
}

export interface RecipientMapEntry {
  pagarmeRecipientId: string;
  companyId: string;
  organizationId: string;
}

/**
 * Classificação fiscal de PRODUTO (NF-e modelo 55). Campos confirmados em nota
 * real (livro/imunidade). `cfopInterno`/`cfopInterestadual` são escolhidos pela
 * UF do destinatário vs. a do emitente. PIS/COFINS são TRIBUTADOS (a imunidade é
 * só do ICMS) — nunca zerar. Tudo vem de configuração, nada hardcoded.
 */
export interface NfeProductClassification {
  codigoProduto?: string | null;
  descricao?: string | null;
  ncm?: string | null;
  cest?: string | null;
  cfopInterno?: string | null; // dentro da UF do emitente (ex.: 5101)
  cfopInterestadual?: string | null; // outra UF (ex.: 6107); x107 só existe na série 6xxx
  origem?: number | null; // 0 = nacional
  cstIcms?: string | null; // ex.: "41" (não tributada / imunidade)
  codigoBeneficioFiscal?: string | null; // cBenef SEFAZ (ex.: SP070130) — exigido p/ CST 41 em SP
  pisCst?: string | null; // ex.: "01"
  pisAliquota?: number | null; // ex.: 0.65 (%)
  cofinsCst?: string | null; // ex.: "01"
  cofinsAliquota?: number | null; // ex.: 3.00 (%)
  infoComplementar?: string | null; // fundamentação de imunidade etc.
}

/**
 * Classificação fiscal por empresa/plano (o que o pagar.me não fornece). Serve
 * tanto NFS-e (item_lista_servico/ISS/discriminação) quanto NF-e (bloco `nfe`).
 */
export interface ServiceCatalogEntry {
  companyId: string;
  documentType?: FiscalDocumentType; // default: 'nfse'
  pagarmePlanId?: string | null;
  // NFS-e
  itemListaServico?: string | null;
  codigoTributarioMunicipio?: string | null;
  aliquotaIss?: number | null;
  discriminacao?: string | null;
  // NF-e (produto)
  nfe?: NfeProductClassification | null;
}

export interface FiscalCompanySettings {
  companyId: string;
  documentType?: FiscalDocumentType; // default: 'nfse'
  ambiente: NfseAmbiente;
  emissionMode: NfseEmissionMode;
  enabled: boolean;
  municipioIbge?: string | null;
  // NFS-e (serviço)
  inscricaoMunicipal?: string | null;
  itemListaServico?: string | null;
  codigoTributarioMunicipio?: string | null;
  aliquotaIss?: number | null;
  issRetido?: boolean | null;
  optanteSimples?: boolean | null;
  discriminacao?: string | null;
  // Barueri (Simples Nacional) — exigidos pela PMB, senão rejeita (erro 801)
  codigoOpcaoSimplesNacional?: number | null; // 3 = ME/EPP
  regimeTributarioSimplesNacional?: number | null; // 1 = federal+municipal pelo Simples
  // NF-e (emitente)
  inscricaoEstadual?: string | null;
  regimeTributario?: number | null; // 1 Simples · 2 SN excesso · 3 Regime Normal
  serie?: string | null; // série própria (ex.: "101") p/ não colidir com emissor legado
  emitenteEndereco?: PagarmeAddress | null;
  // overflow configurável (parâmetros específicos não modelados como coluna)
  parametros?: Record<string, unknown> | null;
}

/** Linha pronta para inserir em `invoice_jobs` (sem campos de default do banco). */
export interface InvoiceJobDraft {
  organizationId: string;
  companyId: string;
  documentType: FiscalDocumentType; // roteia o builder/endpoint (nfse | nfe | …)
  pagarmeAccountId: string;
  pagarmeChargeId: string;
  pagarmeRecipientId: string | null; // null em cobrança sem split (nota da empresa dona)
  ambiente: NfseAmbiente;
  status: InvoiceJobStatus;
  valorServicos: number; // reais — numeric(18,2)
  chargeCreatedAt: string | null; // data da compra (cobrança criada no pagar.me)
  paidAt: string | null; // data do pagamento (charge.paid)
  tomadorDocumento: string | null;
  tomadorNome: string | null;
  tomadorEmail: string | null;
  tomadorEndereco: PagarmeAddress | null;
  // NFS-e (mantidos como colunas por compat)
  itemListaServico: string | null;
  codigoTributarioMunicipio: string | null;
  aliquotaIss: number | null;
  // snapshot dos parâmetros fiscais resolvidos que geram o payload (auditoria +
  // o que o builder NF-e/NFS-e consome). Forma específica por documentType.
  parametros: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export type SkipReason = "recipient_not_mapped";

export interface SkippedSplit {
  recipientId: string;
  reason: SkipReason;
}

export interface ExplodeContext {
  account: PagarmeAccount;
  recipients: RecipientMapEntry[];
  services: ServiceCatalogEntry[];
  settings: FiscalCompanySettings[];
}

export interface ExplodeResult {
  jobs: InvoiceJobDraft[];
  skipped: SkippedSplit[];
}
