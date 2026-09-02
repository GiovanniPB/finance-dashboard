import { supabase } from "@/lib/supabase";

import type {
  AgingBucketRow,
  BillFilters,
  BillsListResult,
  BillWithRelations,
  CreateInstallmentsInput,
  RegisterPaymentInput,
  TransactionInsert,
  TransactionRow,
} from "./types";

const SELECT_WITH_RELATIONS = `
  *,
  account:chart_of_accounts!transactions_account_id_fkey(id, code, name, kind),
  cost_center:cost_centers!transactions_cost_center_id_fkey(id, name),
  bank_account:bank_accounts!transactions_bank_account_id_fkey(id, nickname, bank_name),
  counterparty:counterparties!transactions_counterparty_id_fkey(id, name)
` as const;

export async function fetchBills(filters: BillFilters): Promise<BillsListResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortBy = filters.sortBy ?? "due_date";
  const sortOrder = filters.sortOrder ?? "asc";

  let query = supabase
    .from("v_bills")
    .select(SELECT_WITH_RELATIONS, { count: "exact" })
    .eq("direction", filters.direction);

  if (filters.companyIds) query = query.in("company_id", filters.companyIds);
  // Origem: a chave da projeção é o discriminador. Não-nula = veio dos recebíveis
  // do pagar.me; nula = lançamento humano.
  if (filters.origin === "pagarme") {
    query = query.not("pagarme_projection_key", "is", null);
  } else if (filters.origin === "manual") {
    query = query.is("pagarme_projection_key", null);
  }
  if (filters.from) query = query.gte("due_date", filters.from);
  if (filters.to) query = query.lte("due_date", filters.to);
  if (filters.counterpartyId) query = query.eq("counterparty_id", filters.counterpartyId);
  if (filters.search) query = query.ilike("description", `%${filters.search}%`);
  if (filters.status && filters.status.length > 0) {
    query = query.in("effective_status", filters.status);
  }

  query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as BillWithRelations[];
  const totalCount = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  return { rows, totalCount, pageCount };
}

/**
 * Aging do escopo. A view agrupa por (empresa, direção, faixa); com mais de uma empresa
 * no recorte vêm várias linhas por faixa, então a soma acontece aqui — num lugar só, em
 * vez de cada consumidor somar do seu jeito e o card discordar do total do cabeçalho.
 */
export async function fetchAging(
  companyIds: string[] | null,
  direction: BillFilters["direction"],
): Promise<AgingBucketRow[]> {
  let query = supabase.from("v_bills_aging").select("*").eq("direction", direction);
  if (companyIds) query = query.in("company_id", companyIds);
  const { data, error } = await query;
  if (error) throw error;

  return aggregateAgingByBucket(data ?? [], companyIds);
}

/**
 * Soma as linhas do aging por faixa. Exportada para teste porque é aqui que o total do
 * cabeçalho e o card de faixas precisam concordar: se cada um somasse do seu jeito, a
 * tela mostraria dois totais em aberto diferentes para o mesmo escopo.
 */
export function aggregateAgingByBucket(
  rows: AgingBucketRow[],
  companyIds: string[] | null,
): AgingBucketRow[] {
  const byBucket = new Map<string, AgingBucketRow>();
  for (const row of rows) {
    const key = row.bucket ?? "";
    const acc = byBucket.get(key);
    if (!acc) {
      // company_id perde sentido ao somar mais de uma empresa: fica nulo de propósito.
      byBucket.set(key, {
        ...row,
        company_id: companyIds?.length === 1 ? row.company_id : null,
      });
      continue;
    }
    byBucket.set(key, {
      ...acc,
      count: (acc.count ?? 0) + (row.count ?? 0),
      total: (acc.total ?? 0) + (row.total ?? 0),
    });
  }
  return [...byBucket.values()];
}

export async function createBill(payload: TransactionInsert): Promise<TransactionRow> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...payload,
      status: payload.status ?? "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBill(
  id: string,
  payload: Partial<TransactionInsert>,
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

export async function deleteBill(id: string): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function registerPayment(input: RegisterPaymentInput): Promise<TransactionRow> {
  const { data, error } = await supabase.rpc("register_payment", {
    p_transaction_id: input.transactionId,
    p_amount: input.amount,
    p_paid_at: input.paidAt,
    p_bank_account_id: input.bankAccountId ?? undefined,
    p_interest: input.interest,
    p_fine: input.fine,
    p_discount: input.discount,
  });
  if (error) throw error;
  return data;
}

export async function createInstallments(
  input: CreateInstallmentsInput,
): Promise<TransactionRow[]> {
  const { data, error } = await supabase.rpc("create_installments", {
    p_template: {
      company_id: input.companyId,
      account_id: input.accountId,
      cost_center_id: input.costCenterId,
      counterparty_id: input.counterpartyId,
      direction: input.direction,
      amount: input.totalAmount,
      accrual_date: input.firstDueDate,
      due_date: input.firstDueDate,
      description: input.description,
      document_ref: input.documentRef,
      status: "pending",
    },
    p_installments: input.installments,
    p_interval_days: input.intervalDays,
    p_first_due: input.firstDueDate,
  });
  if (error) throw error;
  return data ?? [];
}
