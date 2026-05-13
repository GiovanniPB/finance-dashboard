import { z } from "zod";

export const EMPLOYEE_KINDS = [
  { value: "clt", label: "CLT" },
  { value: "pj", label: "PJ" },
  { value: "intern", label: "Estagiário" },
  { value: "partner", label: "Sócio" },
] as const;

export const EMPLOYEE_STATUSES = [
  { value: "active", label: "Ativo" },
  { value: "on_leave", label: "Afastado" },
  { value: "terminated", label: "Desligado" },
] as const;

export const employeeFormSchema = z.object({
  companyId: z.string().uuid(),
  costCenterId: z.string().uuid().nullable().optional(),
  fullName: z.string().min(2, "Nome obrigatório").max(200),
  cpf: z.string().max(20).nullable().optional(),
  email: z.string().email("E-mail inválido").max(200).nullable().optional().or(z.literal("")),
  role: z.string().max(120).nullable().optional(),
  department: z.string().max(120).nullable().optional(),
  employeeKind: z.enum(["clt", "pj", "intern", "partner"]),
  baseSalary: z.number().min(0, "Salário não pode ser negativo"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida"),
  terminationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida")
    .nullable()
    .optional(),
  status: z.enum(["active", "on_leave", "terminated"]),
  isPartner: z.boolean(),
  notes: z.string().max(2000).nullable().optional(),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export function emptyEmployeeForm(companyId: string): EmployeeFormValues {
  return {
    companyId,
    costCenterId: null,
    fullName: "",
    cpf: null,
    email: null,
    role: null,
    department: null,
    employeeKind: "clt",
    baseSalary: 0,
    hireDate: new Date().toISOString().slice(0, 10),
    terminationDate: null,
    status: "active",
    isPartner: false,
    notes: null,
  };
}
