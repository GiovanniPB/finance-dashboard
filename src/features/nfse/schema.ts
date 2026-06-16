import { z } from "zod";

// Slug usado na URL do webhook (?account=<slug>) — minúsculas, números e hífen.
const slugRegex = /^[a-z0-9-]+$/u;

export const connectionFormSchema = z.object({
  label: z.string().min(2, "Nome obrigatório").max(80),
  slug: z
    .string()
    .min(2, "Slug obrigatório")
    .max(40)
    .regex(slugRegex, "Use apenas minúsculas, números e hífen"),
  ownerCompanyId: z.string().uuid("Selecione a empresa dona"),
  ambiente: z.enum(["homologacao", "producao"]),
  webhookSecretRef: z.string().max(120).optional().or(z.literal("")),
  active: z.boolean(),
});
export type ConnectionFormValues = z.infer<typeof connectionFormSchema>;

export function emptyConnectionForm(): ConnectionFormValues {
  return {
    label: "",
    slug: "",
    ownerCompanyId: "",
    ambiente: "homologacao",
    webhookSecretRef: "",
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

// Alíquota ISS no app é em % (0–100); no banco é fração (numeric(5,4)).
export const fiscalSettingsFormSchema = z.object({
  companyId: z.string().uuid(),
  ambiente: z.enum(["homologacao", "producao"]),
  emissionMode: z.enum(["manual", "automatic"]),
  enabled: z.boolean(),
  focusTokenRef: z.string().max(120).optional().or(z.literal("")),
  inscricaoMunicipal: z.string().max(40).optional().or(z.literal("")),
  itemListaServico: z.string().max(20).optional().or(z.literal("")),
  codigoTributarioMunicipio: z.string().max(40).optional().or(z.literal("")),
  aliquotaIssPct: z
    .number({ message: "Informe um número" })
    .min(0, "Não pode ser negativa")
    .max(100, "Máximo 100%"),
  issRetido: z.boolean(),
  optanteSimples: z.boolean(),
});
export type FiscalSettingsFormValues = z.infer<typeof fiscalSettingsFormSchema>;

export function emptyFiscalSettingsForm(companyId: string): FiscalSettingsFormValues {
  return {
    companyId,
    ambiente: "homologacao",
    emissionMode: "manual",
    enabled: false,
    focusTokenRef: "",
    inscricaoMunicipal: "",
    itemListaServico: "",
    codigoTributarioMunicipio: "",
    aliquotaIssPct: 0,
    issRetido: false,
    optanteSimples: false,
  };
}
