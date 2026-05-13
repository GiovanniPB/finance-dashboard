import type { Enums, Tables } from "@/lib/supabase";

export type TransactionRow = Tables["transactions"]["Row"];
export type TransactionInsert = Tables["transactions"]["Insert"];
export type TransactionUpdate = Tables["transactions"]["Update"];

export type TransactionDirection = Enums["transaction_direction"];
export type TransactionStatus = Enums["transaction_status"];

/** Row with joined relations from related tables (server projection). */
export interface TransactionWithRelations extends TransactionRow {
  account: {
    id: string;
    code: string;
    name: string;
    kind: Enums["account_kind"];
    dre_section: Enums["dre_section"] | null;
  } | null;
  company: { id: string; trade_name: string | null; legal_name: string } | null;
  cost_center: { id: string; code: string; name: string } | null;
  bank_account: { id: string; nickname: string; bank_name: string } | null;
  counterparty: { id: string; name: string } | null;
}

export interface TransactionFilters {
  companyId?: string | null;
  from?: string | null;
  to?: string | null;
  status?: TransactionStatus[];
  direction?: TransactionDirection | null;
  accountId?: string | null;
  costCenterId?: string | null;
  bankAccountId?: string | null;
  search?: string | null;
  /** 1-based page number */
  page?: number;
  pageSize?: number;
  sortBy?: "accrual_date" | "cash_date" | "amount" | "description";
  sortOrder?: "asc" | "desc";
}

export interface TransactionsListResult {
  rows: TransactionWithRelations[];
  totalCount: number;
  pageCount: number;
  inflowTotal: number;
  outflowTotal: number;
}
