import { supabase } from "@/lib/supabase";

export interface CostCenterRow {
  /** Nulo = lançamento sem centro de custo atribuído. */
  costCenterId: string | null;
  name: string;
  /** De quantas empresas o total veio. Acima de 1, a linha é uma soma. */
  companiesCount: number;
  revenue: number;
  expense: number;
  net: number;
  marginPct: number | null;
  transactionCount: number;
}

/**
 * Resultado por centro de custo do escopo. `companyIds` nulo = todas as operacionais
 * acessíveis; array = recorte.
 *
 * A central de custos é global, então o `cost_center_id` já é a identidade compartilhada
 * entre empresas: agregar é o próprio `group by`, sem casar nome nenhum.
 */
export async function fetchCostCenterAnalysis(
  companyIds: string[] | null,
  from: string,
  to: string,
): Promise<CostCenterRow[]> {
  const { data, error } = await supabase.rpc("cost_center_analysis_multi", {
    p_company_ids: companyIds ?? undefined,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    costCenterId: r.cost_center_id,
    name: r.cost_center_name,
    companiesCount: r.companies_count,
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
  /** De quantas empresas do escopo esta contraparte teve movimento. */
  companiesCount: number;
}

/**
 * Movimento por contraparte no escopo. Aqui a consolidação é trivial e sem decisão:
 * `counterparties` é da organização, então o mesmo cliente é uma entidade só entre
 * empresas.
 */
export async function fetchCounterpartyAnalysis(
  companyIds: string[] | null,
  from: string,
  to: string,
  kind: CounterpartyKindFilter = "all",
  limit = 20,
): Promise<CounterpartyRow[]> {
  const { data, error } = await supabase.rpc("counterparty_analysis", {
    p_company_ids: companyIds ?? undefined,
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
    companiesCount: r.companies_count,
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

const mapComparisonRow = (r: {
  account_id: string | null;
  code: string | null;
  name: string | null;
  dre_section: string | null;
  is_summary: boolean | null;
  sort_order: number | null;
  total_a: number | null;
  total_b: number | null;
  variance_abs: number | null;
  variance_pct: number | null;
}): DreComparisonRow => ({
  accountId: r.account_id,
  code: r.code ?? "",
  name: r.name ?? "",
  dreSection: r.dre_section,
  isSummary: r.is_summary ?? false,
  sortOrder: r.sort_order ?? 0,
  totalA: r.total_a ?? 0,
  totalB: r.total_b ?? 0,
  varianceAbs: r.variance_abs ?? 0,
  variancePct: r.variance_pct,
});

/** Comparativo de UMA empresa, pelo plano de contas dela. */
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
  return (data ?? []).map(mapComparisonRow);
}

/**
 * Comparativo agregado pelo plano-mestre. `companyIds` nulo = organização inteira;
 * array = recorte de um grupo.
 *
 * Não existe versão "soma dos comparativos por empresa": com planos de contas
 * diferentes entre empresas, o que casa as linhas é o plano-mestre.
 */
export async function fetchDreComparisonConsolidated(
  organizationId: string,
  periodAFrom: string,
  periodATo: string,
  periodBFrom: string,
  periodBTo: string,
  companyIds: string[] | null,
): Promise<DreComparisonRow[]> {
  const { data, error } = await supabase.rpc("dre_comparison_multi", {
    p_organization_id: organizationId,
    p_period_a_from: periodAFrom,
    p_period_a_to: periodATo,
    p_period_b_from: periodBFrom,
    p_period_b_to: periodBTo,
    p_company_ids: companyIds ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map(mapComparisonRow);
}
