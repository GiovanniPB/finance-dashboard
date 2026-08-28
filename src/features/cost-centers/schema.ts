import { z } from "zod";

export const costCenterFormSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(2, "Nome obrigatório").max(120),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean(),
});

export type CostCenterFormValues = z.infer<typeof costCenterFormSchema>;

export function emptyCostCenterForm(companyId: string): CostCenterFormValues {
  return {
    companyId,
    name: "",
    description: null,
    isActive: true,
  };
}
