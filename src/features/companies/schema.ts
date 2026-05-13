import { z } from "zod";

export const TAX_REGIMES = [
  { value: "simples", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
  { value: "mei", label: "MEI" },
] as const;

export const companyFormSchema = z.object({
  organizationId: z.string().uuid(),
  legalName: z.string().min(2, "Razão social obrigatória").max(200),
  tradeName: z.string().min(2, "Nome fantasia obrigatório").max(200).nullable(),
  cnpj: z
    .string()
    .regex(/^\d{14}$/u, "CNPJ deve conter 14 dígitos")
    .nullable(),
  taxRegime: z.enum(["simples", "lucro_presumido", "lucro_real", "mei"]),
  isHolding: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  brandColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/iu, "Use formato #RRGGBB")
    .nullable(),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

export function emptyCompanyForm(organizationId: string): CompanyFormValues {
  return {
    organizationId,
    legalName: "",
    tradeName: "",
    cnpj: null,
    taxRegime: "lucro_presumido",
    isHolding: false,
    isActive: true,
    sortOrder: 0,
    brandColor: null,
  };
}
