import { z } from "zod";

export const RECURRENCE_FREQUENCIES = [
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "yearly", label: "Anual" },
] as const;

export const recurringFormSchema = z.object({
  companyId: z.string().uuid(),
  accountId: z.string().uuid({ message: "Conta obrigatória" }),
  // Campos copiados para cada lançamento gerado.
  bankAccountId: z.string().uuid().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  counterpartyId: z.string().uuid().nullable().optional(),
  documentRef: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  description: z.string().min(2, "Descrição obrigatória").max(200),
  amount: z.number().positive("Valor deve ser maior que zero"),
  direction: z.enum(["inflow", "outflow"]),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"]),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .nullable()
    .optional(),
  maxOccurrences: z.number().int().positive().nullable().optional(),
  autoGenerate: z.boolean(),
  isActive: z.boolean(),
});

export type RecurringFormValues = z.infer<typeof recurringFormSchema>;

export function emptyRecurringForm(companyId: string): RecurringFormValues {
  return {
    companyId,
    accountId: "",
    bankAccountId: null,
    costCenterId: null,
    counterpartyId: null,
    documentRef: null,
    notes: null,
    description: "",
    amount: 0,
    direction: "outflow",
    frequency: "monthly",
    dayOfMonth: 5,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    maxOccurrences: null,
    autoGenerate: true,
    isActive: true,
  };
}
