import { z } from "zod";

import type { BillEffectiveStatus } from "./types";

export const billFormSchema = z
  .object({
    companyId: z.string().uuid("Empresa obrigatória"),
    accountId: z.string().uuid("Conta obrigatória"),
    costCenterId: z.string().uuid().nullable(),
    counterpartyId: z.string().uuid().nullable(),
    direction: z.enum(["inflow", "outflow"]),
    amount: z.coerce.number().positive("Valor deve ser maior que zero"),
    accrualDate: z
      .string()
      .min(1, "Data obrigatória")
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida"),
    dueDate: z
      .string()
      .min(1, "Vencimento obrigatório")
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida"),
    description: z.string().min(2, "Descrição obrigatória").max(500),
    documentRef: z.string().max(200).nullable(),
    notes: z.string().max(2000).nullable(),
    // Parcelamento
    installments: z.coerce.number().int().min(1).max(360),
    intervalDays: z.coerce.number().int().min(1).max(365),
  })
  .refine((v) => v.installments === 1 || v.amount > 0, {
    path: ["amount"],
    message: "Valor total obrigatório para parcelamento",
  });

export type BillFormValues = z.infer<typeof billFormSchema>;

export function emptyBillForm(companyId: string, direction: "inflow" | "outflow"): BillFormValues {
  const today = new Date().toISOString().slice(0, 10);
  return {
    companyId,
    accountId: "",
    costCenterId: null,
    counterpartyId: null,
    direction,
    amount: 0,
    accrualDate: today,
    dueDate: today,
    description: "",
    documentRef: null,
    notes: null,
    installments: 1,
    intervalDays: 30,
  };
}

export const paymentFormSchema = z.object({
  amount: z.coerce.number().positive("Valor obrigatório"),
  paidAt: z
    .string()
    .min(1, "Data obrigatória")
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida"),
  bankAccountId: z.string().uuid("Conta bancária obrigatória"),
  interest: z.coerce.number().min(0),
  fine: z.coerce.number().min(0),
  discount: z.coerce.number().min(0),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const STATUS_META: Record<
  BillEffectiveStatus,
  { label: string; tone: "default" | "accent" | "income" | "expense" | "warning" | "info" }
> = {
  open: { label: "Em aberto", tone: "info" },
  partial: { label: "Parcial", tone: "warning" },
  overdue: { label: "Vencido", tone: "expense" },
  paid: { label: "Pago", tone: "income" },
  canceled: { label: "Cancelado", tone: "default" },
};

export const ALL_STATUSES: BillEffectiveStatus[] = [
  "open",
  "partial",
  "overdue",
  "paid",
  "canceled",
];

export const AGING_BUCKETS = [
  { value: "future", label: "A vencer", tone: "info" as const },
  { value: "b_0_30", label: "0-30 dias", tone: "warning" as const },
  { value: "b_31_60", label: "31-60 dias", tone: "warning" as const },
  { value: "b_61_90", label: "61-90 dias", tone: "expense" as const },
  { value: "b_90_plus", label: "+90 dias", tone: "expense" as const },
];
