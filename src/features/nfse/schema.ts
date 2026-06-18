import { z } from "zod";

// O slug (URL do webhook) é gerado automaticamente do nome no banco e o segredo
// do webhook é gerado pelo sistema — o usuário não digita nenhum dos dois.
export const connectionFormSchema = z.object({
  label: z.string().min(2, "Nome obrigatório").max(80),
  ownerCompanyId: z.string().uuid("Selecione a empresa dona"),
  ambiente: z.enum(["homologacao", "producao"]),
  active: z.boolean(),
});
export type ConnectionFormValues = z.infer<typeof connectionFormSchema>;

export function emptyConnectionForm(): ConnectionFormValues {
  return {
    label: "",
    ownerCompanyId: "",
    ambiente: "homologacao",
    active: true,
  };
}

export const recipientFormSchema = z.object({
  pagarmeRecipientId: z
    .string()
    .min(3, "ID do recebedor obrigatório")
    .max(60)
    .regex(/^(re_|rp_)/u, "Deve começar com re_ ou rp_"),
  companyId: z.string().uuid("Selecione a empresa"),
  active: z.boolean(),
});
export type RecipientFormValues = z.infer<typeof recipientFormSchema>;

const optText = (max = 60) => z.string().max(max).optional().or(z.literal(""));
const pct = z
  .number({ message: "Informe um número" })
  .min(0, "Não pode ser negativa")
  .max(100, "Máximo 100%");

// Alíquota ISS/PIS/COFINS no app é em % (0–100); ISS no banco vira fração.
export const fiscalSettingsFormSchema = z.object({
  companyId: z.string().uuid(),
  documentType: z.enum(["nfse", "nfe"]),
  ambiente: z.enum(["homologacao", "producao"]),
  emissionMode: z.enum(["manual", "automatic"]),
  enabled: z.boolean(),

  // NFS-e (serviço)
  inscricaoMunicipal: optText(40),
  itemListaServico: optText(20),
  codigoTributarioMunicipio: optText(40),
  aliquotaIssPct: pct,
  issRetido: z.boolean(),
  optanteSimples: z.boolean(),
  discriminacao: optText(200),
  codigoOpcaoSimplesNacional: optText(2), // numérico (3 = ME/EPP) — Barueri
  regimeTributarioSimplesNacional: optText(2), // numérico (1) — Barueri

  // NF-e (emitente)
  inscricaoEstadual: optText(20),
  regimeTributario: z.number().int().min(1).max(3),
  serie: optText(10),
  emitenteLogradouro: optText(120),
  emitenteNumero: optText(20),
  emitenteComplemento: optText(120),
  emitenteBairro: optText(80),
  emitenteMunicipio: optText(80),
  emitenteUf: optText(2),
  emitenteCep: optText(9),

  // NF-e (produto) — defaults guardados em parametros.nfe
  codigoProduto: optText(20),
  produtoDescricao: optText(120),
  ncm: optText(10),
  cest: optText(10),
  cfopInterno: optText(4),
  cfopInterestadual: optText(4),
  cstIcms: optText(3),
  codigoBeneficioFiscal: optText(10),
  pisAliquotaPct: pct,
  cofinsAliquotaPct: pct,
  infoComplementar: optText(500),
});
export type FiscalSettingsFormValues = z.infer<typeof fiscalSettingsFormSchema>;

export function emptyFiscalSettingsForm(companyId: string): FiscalSettingsFormValues {
  return {
    companyId,
    documentType: "nfse",
    ambiente: "homologacao",
    emissionMode: "manual",
    enabled: false,
    inscricaoMunicipal: "",
    itemListaServico: "",
    codigoTributarioMunicipio: "",
    aliquotaIssPct: 0,
    issRetido: false,
    optanteSimples: false,
    discriminacao: "",
    codigoOpcaoSimplesNacional: "",
    regimeTributarioSimplesNacional: "",
    inscricaoEstadual: "",
    regimeTributario: 3,
    serie: "",
    emitenteLogradouro: "",
    emitenteNumero: "",
    emitenteComplemento: "",
    emitenteBairro: "",
    emitenteMunicipio: "",
    emitenteUf: "",
    emitenteCep: "",
    codigoProduto: "",
    produtoDescricao: "",
    ncm: "",
    cest: "",
    cfopInterno: "",
    cfopInterestadual: "",
    cstIcms: "",
    codigoBeneficioFiscal: "",
    pisAliquotaPct: 0,
    cofinsAliquotaPct: 0,
    infoComplementar: "",
  };
}

// Cobrança de teste (sandbox). O valor é em reais (vira centavos na API). O
// split é montado fora do form (por recebedor), então não entra aqui.
export const sandboxChargeFormSchema = z.object({
  method: z.enum(["credit_card", "pix", "boleto"]),
  scenario: z.string().min(1, "Selecione um cenário"),
  amountReais: z.coerce.number().positive("Valor deve ser positivo"),
  description: optText(120),
  customerName: z.string().min(2, "Nome obrigatório").max(64),
  customerEmail: z.string().email("E-mail inválido"),
  customerDocument: optText(18),
  cep: optText(9),
  line1: optText(120),
  city: optText(60),
  uf: optText(2),
  useSplit: z.boolean(),
});
export type SandboxChargeFormValues = z.infer<typeof sandboxChargeFormSchema>;

export function emptySandboxChargeForm(): SandboxChargeFormValues {
  return {
    method: "credit_card",
    scenario: "paid",
    amountReais: 100,
    description: "",
    customerName: "Tomador Teste",
    customerEmail: "tomador.teste@example.com",
    customerDocument: "",
    cep: "06401000",
    line1: "100, Rua Exemplo, Centro",
    city: "Barueri",
    uf: "SP",
    useSplit: false,
  };
}
