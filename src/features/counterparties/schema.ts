import { z } from "zod";

export const COUNTERPARTY_KINDS = [
  { value: "customer", label: "Cliente" },
  { value: "supplier", label: "Fornecedor" },
  { value: "employee", label: "Colaborador" },
  { value: "partner", label: "Sócio" },
  { value: "government", label: "Governo / Impostos" },
  { value: "other", label: "Outros" },
] as const;

export const counterpartyFormSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2, "Nome obrigatório").max(200),
  document: z.string().max(40).nullable().optional(),
  kind: z.enum(["customer", "supplier", "employee", "partner", "government", "other"]),
  email: z.string().email("E-mail inválido").max(200).nullable().optional().or(z.literal("")),
  phone: z.string().max(40).nullable().optional(),
  isActive: z.boolean(),
});

export type CounterpartyFormValues = z.infer<typeof counterpartyFormSchema>;

export function emptyCounterpartyForm(organizationId: string): CounterpartyFormValues {
  return {
    organizationId,
    name: "",
    document: null,
    kind: "supplier",
    email: null,
    phone: null,
    isActive: true,
  };
}
