import { z } from "zod";

import { DATA_MODULES } from "@/features/auth/modules";

export const USER_ROLES = [
  {
    value: "super_admin",
    label: "Super Admin",
    description: "Acesso total ao sistema, gerencia usuários e empresas",
  },
  {
    value: "admin",
    label: "Administrador",
    description: "Cria/edita/exclui em empresas atribuídas",
  },
  {
    value: "editor",
    label: "Lançador",
    description: "Cria/edita lançamentos em empresas atribuídas",
  },
  { value: "viewer", label: "Visualizador", description: "Somente leitura em empresas atribuídas" },
] as const;

export const userFormSchema = z
  .object({
    fullName: z.string().min(2, "Nome obrigatório").max(120),
    email: z.string().email("Email inválido"),
    role: z.enum(["super_admin", "admin", "editor", "viewer"]),
    password: z.string().min(8, "Mínimo 8 caracteres").max(72).optional().or(z.literal("")),
    companyIds: z.array(z.string().uuid()),
    /** Vazio = enxerga todos os módulos (equivale a NULL no banco). */
    visibleModules: z.array(z.enum(DATA_MODULES)),
  })
  .refine((v) => v.role === "super_admin" || v.companyIds.length > 0, {
    message: "Selecione ao menos uma empresa (ou marque como Super Admin)",
    path: ["companyIds"],
  });

export type UserFormValues = z.infer<typeof userFormSchema>;

export function emptyUserForm(): UserFormValues {
  return {
    fullName: "",
    email: "",
    role: "editor",
    password: "",
    companyIds: [],
    visibleModules: [],
  };
}
