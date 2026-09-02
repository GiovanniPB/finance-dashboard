import { z } from "zod";

export const costCenterFormSchema = z.object({
  name: z.string().min(2, "Nome obrigatório").max(120),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean(),
});

export type CostCenterFormValues = z.infer<typeof costCenterFormSchema>;

export function emptyCostCenterForm(): CostCenterFormValues {
  return {
    name: "",
    description: null,
    isActive: true,
  };
}
