import { z } from "zod";

export const companyGroupSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao grupo").max(80, "No máximo 80 caracteres"),
  description: z.string().trim().max(280, "No máximo 280 caracteres").optional(),
  // Duas é o mínimo que justifica um grupo: com uma só, o switcher já tem a empresa,
  // e um "grupo" de uma empresa vira dois caminhos para o mesmo número.
  companyIds: z.array(z.string().uuid()).min(2, "Escolha pelo menos duas empresas"),
});

export type CompanyGroupFormValues = z.infer<typeof companyGroupSchema>;
