import { z } from "zod";

/**
 * Fonte única dos tipos de conta — o `z.enum` e a lista de opções derivam daqui,
 * então acrescentar um valor no enum do banco só precisa de uma edição.
 * Espelha `bank_account_type` no Postgres.
 */
export const BANK_ACCOUNT_TYPE_VALUES = [
  "checking",
  "savings",
  "cdb_automatic",
  "cdb_daily",
  "cdb_term",
  "investment_fund",
  "cash",
  "payment_gateway",
] as const;

export type BankAccountTypeValue = (typeof BANK_ACCOUNT_TYPE_VALUES)[number];

const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountTypeValue, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cdb_automatic: "CDB Resgate Automático",
  cdb_daily: "CDB Liquidação diária",
  cdb_term: "CDB a prazo",
  investment_fund: "Fundo de investimento",
  cash: "Caixa",
  // carteira de gateway (pagar.me): recebe as liquidações, paga as taxas de
  // adquirência e sai por transferência para o banco real
  payment_gateway: "Gateway de pagamento",
};

export const BANK_ACCOUNT_TYPES = BANK_ACCOUNT_TYPE_VALUES.map((value) => ({
  value,
  label: BANK_ACCOUNT_TYPE_LABELS[value],
}));

export const bankAccountFormSchema = z.object({
  companyId: z.string().uuid(),
  bankName: z.string().min(2, "Banco obrigatório").max(120),
  nickname: z.string().min(2, "Apelido obrigatório").max(120),
  accountType: z.enum(BANK_ACCOUNT_TYPE_VALUES),
  agency: z.string().max(20).nullable().optional(),
  accountNumber: z.string().max(40).nullable().optional(),
  initialBalance: z.number().min(0, "Saldo inicial não pode ser negativo"),
  initialBalanceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida")
    .nullable()
    .optional(),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
  notes: z.string().max(2000).nullable().optional(),
});

export type BankAccountFormValues = z.infer<typeof bankAccountFormSchema>;

export const transferFormSchema = z
  .object({
    companyId: z.string().uuid(),
    fromAccountId: z.string().uuid("Escolha a conta de origem"),
    toAccountId: z.string().uuid("Escolha a conta de destino"),
    amount: z.number().positive("Valor deve ser maior que zero"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida"),
    description: z.string().max(300).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Origem e destino devem ser contas diferentes",
    path: ["toAccountId"],
  });

export type TransferFormValues = z.infer<typeof transferFormSchema>;

export function emptyTransferForm(companyId: string, fromAccountId = ""): TransferFormValues {
  return {
    companyId,
    fromAccountId,
    toAccountId: "",
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    description: null,
    notes: null,
  };
}

export function emptyBankAccountForm(companyId: string): BankAccountFormValues {
  return {
    companyId,
    bankName: "",
    nickname: "",
    accountType: "checking",
    agency: null,
    accountNumber: null,
    initialBalance: 0,
    initialBalanceDate: null,
    sortOrder: 0,
    isActive: true,
    notes: null,
  };
}
