import { supabase } from "@/lib/supabase";

import {
  NO_BANK_ACCOUNT,
  type TransactionFilters,
  type TransactionInsert,
  type TransactionRow,
  type TransactionsListResult,
  type TransactionStatus,
  type TransactionUpdate,
  type TransactionWithRelations,
} from "./types";

const SELECT_WITH_RELATIONS = `
  *,
  account:chart_of_accounts!transactions_account_id_fkey(id, code, name, kind, dre_section),
  company:companies!transactions_company_id_fkey(id, trade_name, legal_name),
  cost_center:cost_centers!transactions_cost_center_id_fkey(id, code, name),
  bank_account:bank_accounts!transactions_bank_account_id_fkey(id, nickname, bank_name),
  counterparty:counterparties!transactions_counterparty_id_fkey(id, name)
` as const;

export async function fetchTransactions(
  filters: TransactionFilters,
): Promise<TransactionsListResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortBy = filters.sortBy ?? "accrual_date";
  const sortOrder = filters.sortOrder ?? "desc";

  let query = supabase
    .from("transactions")
    .select(SELECT_WITH_RELATIONS, { count: "exact" })
    .is("deleted_at", null);

  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.from) query = query.gte("accrual_date", filters.from);
  if (filters.to) query = query.lte("accrual_date", filters.to);
  if (filters.status && filters.status.length > 0) query = query.in("status", filters.status);
  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.costCenterId) query = query.eq("cost_center_id", filters.costCenterId);
  if (filters.bankAccountId === NO_BANK_ACCOUNT) query = query.is("bank_account_id", null);
  else if (filters.bankAccountId) query = query.eq("bank_account_id", filters.bankAccountId);
  if (filters.search) query = query.ilike("description", `%${filters.search}%`);

  query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as TransactionWithRelations[];
  const totalCount = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // Totais para o footer (somente os da página atual — soma global virá de RPC futura)
  let inflowTotal = 0;
  let outflowTotal = 0;
  for (const r of rows) {
    if (r.direction === "inflow") inflowTotal += r.amount;
    else outflowTotal += r.amount;
  }

  return { rows, totalCount, pageCount, inflowTotal, outflowTotal };
}

/** Teto por operação, espelhando a validação da RPC. */
export const BULK_EDIT_LIMIT = 2000;

/**
 * Campos editáveis em massa. Chave ausente = não altera; chave com null = limpa
 * o campo. `account_id` e `status` não aceitam null (são not null na tabela).
 */
export interface BulkPatch {
  bank_account_id?: string | null;
  account_id?: string;
  cost_center_id?: string | null;
  counterparty_id?: string | null;
  status?: TransactionStatus;
  cash_date?: string;
  // O parâmetro da RPC é jsonb; o tipo gerado exige index signature.
  [key: string]: string | null | undefined;
}

/** Aplica o patch aos lançamentos. Devolve quantos foram alterados. */
export async function bulkUpdateTransactions(ids: string[], patch: BulkPatch): Promise<number> {
  const { data, error } = await supabase.rpc("bulk_update_transactions", {
    p_ids: ids,
    p_patch: patch,
  });
  if (error) throw error;
  return data;
}

/**
 * Ids de todos os lançamentos que batem com o filtro, para "selecionar tudo"
 * sem depender da página atual. Limitado ao teto da edição em massa.
 */
export async function fetchTransactionIds(filters: TransactionFilters): Promise<string[]> {
  let query = supabase.from("transactions").select("id").is("deleted_at", null);

  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.from) query = query.gte("accrual_date", filters.from);
  if (filters.to) query = query.lte("accrual_date", filters.to);
  if (filters.status && filters.status.length > 0) query = query.in("status", filters.status);
  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.costCenterId) query = query.eq("cost_center_id", filters.costCenterId);
  if (filters.bankAccountId === NO_BANK_ACCOUNT) query = query.is("bank_account_id", null);
  else if (filters.bankAccountId) query = query.eq("bank_account_id", filters.bankAccountId);
  if (filters.search) query = query.ilike("description", `%${filters.search}%`);

  const { data, error } = await query.limit(BULK_EDIT_LIMIT);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

export async function createTransaction(payload: TransactionInsert): Promise<TransactionRow> {
  const { data, error } = await supabase.from("transactions").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateTransaction(
  id: string,
  payload: TransactionUpdate,
): Promise<TransactionRow> {
  const { data, error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function softDeleteTransaction(id: string): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id);
  if (error) throw error;
}
