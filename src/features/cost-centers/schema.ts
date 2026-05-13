import { z } from "zod";

export const costCenterFormSchema = z.object({
  companyId: z.string().uuid(),
  code: z
    .string()
    .min(1, "Código obrigatório")
    .max(20)
    .regex(/^[A-Z0-9._-]+$/u, "Use letras maiúsculas, números, ponto, hífen ou underline"),
  name: z.string().min(2, "Nome obrigatório").max(120),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean(),
});

export type CostCenterFormValues = z.infer<typeof costCenterFormSchema>;

export function emptyCostCenterForm(companyId: string): CostCenterFormValues {
  return {
    companyId,
    code: "",
    name: "",
    description: null,
    isActive: true,
  };
}
