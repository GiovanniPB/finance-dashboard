import type { Enums, Tables, Views } from "@/lib/supabase";

export type BillRow = Views["v_bills"]["Row"];
export type TransactionRow = Tables["transactions"]["Row"];
export type TransactionInsert = Tables["transactions"]["Insert"];

export type BillDirection = Enums["transaction_direction"];
export type BillBaseStatus = Enums["transaction_status"];

/** Computed status returned by v_bills.effective_status */
export type BillEffectiveStatus = "open" | "partial" | "overdue" | "paid" | "canceled";

export interface BillWithRelations extends BillRow {
  account: {
    id: string;
    code: string;
    name: string;
    kind: Enums["account_kind"];
  } | null;
  cost_center: { id: string; name: string } | null;
  bank_account: { id: string; nickname: string; bank_name: string } | null;
  counterparty: { id: string; name: string } | null;
}

/**
 * Origem do título. `pagarme` = gerado pela projeção dos recebíveis (agrega as
 * parcelas que liquidam no mesmo dia); `manual` = lançado por uma pessoa.
 */
export type BillOrigin = "all" | "pagarme" | "manual";

export interface BillFilters {
  companyId?: string | null;
  direction: BillDirection;
  /** Recorte por origem do título. Ausente = todas. */
  origin?: BillOrigin;
  /** When set, restricts to bills whose effective_status matches. */
  status?: BillEffectiveStatus[];
  from?: string | null;
  to?: string | null;
  counterpartyId?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: "due_date" | "amount" | "description";
  sortOrder?: "asc" | "desc";
}

export interface BillsListResult {
  rows: BillWithRelations[];
  /** Total de títulos que casam com o filtro — não só os da página. */
  totalCount: number;
  pageCount: number;
}

export interface AgingBucketRow {
  company_id: string | null;
  direction: BillDirection | null;
  bucket: string | null;
  count: number | null;
  total: number | null;
}

export interface RegisterPaymentInput {
  transactionId: string;
  amount: number;
  paidAt: string;
  bankAccountId: string | null;
  interest: number;
  fine: number;
  discount: number;
}

export interface CreateInstallmentsInput {
  companyId: string;
  accountId: string;
  costCenterId: string | null;
  counterpartyId: string | null;
  direction: BillDirection;
  totalAmount: number;
  installments: number;
  firstDueDate: string;
  intervalDays: number;
  description: string;
  documentRef: string | null;
}
