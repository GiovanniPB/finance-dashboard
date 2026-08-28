import { supabase } from "@/lib/supabase";

export interface CostCenterRow {
  costCenterId: string | null;
  name: string;
  revenue: number;
  expense: number;
  net: number;
  marginPct: number | null;
  transactionCount: number;
}

export async function fetchCostCenterAnalysis(
  companyId: string,
  from: string,
  to: string,
): Promise<CostCenterRow[]> {
  const { data, error } = await supabase.rpc("cost_center_analysis", {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    costCenterId: r.cost_center_id,
    name: r.cost_center_name,
    revenue: r.revenue,
    expense: r.expense,
    net: r.net,
    marginPct: r.margin_pct,
    transactionCount: r.transaction_count,
  }));
}

export type CounterpartyKindFilter =
  | "all"
  | "customer"
  | "supplier"
  | "employee"
  | "partner"
  | "government"
  | "other";

export interface CounterpartyRow {
  counterpartyId: string;
  name: string;
  kind: string;
  totalInflow: number;
  totalOutflow: number;
  net: number;
  transactionCount: number;
  avgTicket: number;
  lastMovement: string;
}

export async function fetchCounterpartyAnalysis(
  companyId: string,
  from: string,
  to: string,
  kind: CounterpartyKindFilter = "all",
  limit = 20,
): Promise<CounterpartyRow[]> {
  const { data, error } = await supabase.rpc("counterparty_analysis", {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
    p_kind: kind,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    counterpartyId: r.counterparty_id,
    name: r.counterparty_name,
    kind: r.counterparty_kind,
    totalInflow: r.total_inflow,
    totalOutflow: r.total_outflow,
    net: r.net,
    transactionCount: r.transaction_count,
    avgTicket: r.avg_ticket,
    lastMovement: r.last_movement,
  }));
}

export interface DreComparisonRow {
  accountId: string | null;
  code: string;
  name: string;
  dreSection: string | null;
  isSummary: boolean;
  sortOrder: number;
  totalA: number;
  totalB: number;
  varianceAbs: number;
  variancePct: number | null;
}

export async function fetchDreComparison(
  companyId: string,
  periodAFrom: string,
  periodATo: string,
  periodBFrom: string,
  periodBTo: string,
): Promise<DreComparisonRow[]> {
  const { data, error } = await supabase.rpc("dre_comparison", {
    p_company_id: companyId,
    p_period_a_from: periodAFrom,
    p_period_a_to: periodATo,
    p_period_b_from: periodBFrom,
    p_period_b_to: periodBTo,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    accountId: r.account_id,
    code: r.code,
    name: r.name,
    dreSection: r.dre_section,
    isSummary: r.is_summary,
    sortOrder: r.sort_order,
    totalA: r.total_a,
    totalB: r.total_b,
    varianceAbs: r.variance_abs,
    variancePct: r.variance_pct,
  }));
}
