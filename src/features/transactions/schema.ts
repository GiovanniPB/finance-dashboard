import { z } from "zod";

export const transactionFormSchema = z.object({
  companyId: z.string().uuid({ message: "Empresa obrigatória" }),
  accountId: z.string().uuid({ message: "Conta obrigatória" }),
  costCenterId: z.string().uuid().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  counterpartyId: z.string().uuid().nullable().optional(),

  direction: z.enum(["inflow", "outflow"]),
  amount: z.number().positive("Valor deve ser maior que zero"),

  accrualDate: z
    .string()
    .min(1, "Data de competência obrigatória")
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida"),
  cashDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida")
    .nullable()
    .optional(),

  status: z.enum(["scheduled", "pending", "settled", "reconciled", "canceled"]),

  description: z.string().min(2, "Descrição deve ter no mínimo 2 caracteres").max(500),
  documentRef: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export function emptyFormValues(companyId: string): TransactionFormValues {
  const today = new Date().toISOString().slice(0, 10);
  return {
    companyId,
    accountId: "",
    costCenterId: null,
    bankAccountId: null,
    counterpartyId: null,
    direction: "outflow",
    amount: 0,
    accrualDate: today,
    cashDate: today,
    status: "settled",
    description: "",
    documentRef: null,
    notes: null,
  };
}
