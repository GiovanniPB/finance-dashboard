import { supabase, type Enums } from "@/lib/supabase";

import type { BalanceDrilldown, MonthlySeriesRow } from "./compute";
import {
  DATE_COLUMN_BY_BASIS,
  directionForMeasure,
  STATUSES_BY_BASIS,
  unclassifiedOrFilter,
  type AccountingBasis,
} from "./drilldown";
import { parseBalanceLines, type BalanceLine } from "./schema";

export async function fetchMonthlySeries(
  companyId: string,
  from: string,
  to: string,
  basis: AccountingBasis,
): Promise<MonthlySeriesRow[]> {
  const { data, error } = await supabase.rpc("cost_center_monthly_series", {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
    p_basis: basis,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    month: r.month,
    costCenterId: r.cost_center_id,
    revenue: r.revenue,
    expense: r.expense,
  }));
}

/** Modelo da empresa. Empresa sem modelo ainda devolve lista vazia, não erro. */
export async function fetchBalanceModel(companyId: string): Promise<BalanceLine[]> {
  const { data, error } = await supabase
    .from("balance_report_models")
    .select("lines")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return parseBalanceLines(data?.lines);
}

export async function saveBalanceModel(
  companyId: string,
  lines: BalanceLine[],
): Promise<BalanceLine[]> {
  const { data, error } = await supabase
    .from("balance_report_models")
    .upsert({ company_id: companyId, lines }, { onConflict: "company_id" })
    .select("lines")
    .single();
  if (error) throw error;
  return parseBalanceLines(data.lines);
}

/* ─── Lançamentos por trás de uma linha ──────────────────────────────────── */

const LINE_TX_SELECT = `
  id, accrual_date, cash_date, description, amount, direction, status, document_ref,
  account:chart_of_accounts!transactions_account_id_fkey(code, name),
  cost_center:cost_centers!transactions_cost_center_id_fkey(id, name),
  counterparty:counterparties!transactions_counterparty_id_fkey(name)
` as const;

export interface LineTransaction {
  id: string;
  accrual_date: string;
  cash_date: string | null;
  description: string;
  amount: number;
  direction: Enums["transaction_direction"];
  status: Enums["transaction_status"];
  document_ref: string | null;
  account: { code: string; name: string } | null;
  cost_center: { id: string; name: string } | null;
  counterparty: { name: string } | null;
}

/**
 * Teto da listagem. Um centro com um ano de movimento passa de mil lançamentos, e
 * a gaveta é para conferir a composição, não para paginar o extrato inteiro —
 * quem precisa disso vai para /transactions com os filtros.
 */
export const LINE_TRANSACTIONS_LIMIT = 500;

export interface LineTransactionsResult {
  rows: LineTransaction[];
  /** Total que casa com o filtro, mesmo quando a listagem é truncada. */
  totalCount: number;
}

export async function fetchLineTransactions(params: {
  companyId: string;
  from: string;
  to: string;
  drilldown: BalanceDrilldown;
  basis: AccountingBasis;
}): Promise<LineTransactionsResult> {
  const { companyId, from, to, drilldown, basis } = params;

  // A data e os status vêm do regime: a lista precisa dos mesmos filtros da
  // série, senão ela não soma o número da célula que foi clicada.
  const dateColumn = DATE_COLUMN_BY_BASIS[basis];

  let query = supabase
    .from("transactions")
    .select(LINE_TX_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .eq("company_id", companyId)
    .gte(dateColumn, from)
    .lte(dateColumn, to)
    .in("status", [...STATUSES_BY_BASIS[basis]]);

  if (drilldown.kind === "cost_centers") {
    // Sem centro nenhum a linha vale zero; `in.()` vazio seria erro de sintaxe.
    if (drilldown.costCenterIds.length === 0) return { rows: [], totalCount: 0 };
    query = query.in("cost_center_id", drilldown.costCenterIds);

    const direction = directionForMeasure(drilldown.measure);
    if (direction) query = query.eq("direction", direction);
  } else {
    query = query.or(unclassifiedOrFilter(drilldown));
  }

  const { data, error, count } = await query
    .order(dateColumn, { ascending: false })
    .order("amount", { ascending: false })
    .limit(LINE_TRANSACTIONS_LIMIT);

  if (error) throw error;
  return { rows: (data ?? []) as unknown as LineTransaction[], totalCount: count ?? 0 };
}
