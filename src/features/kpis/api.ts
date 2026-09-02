import { supabase } from "@/lib/supabase";

export interface MonthlyKpi {
  month_start: string;
  gross_revenue: number;
  revenue_deductions: number;
  net_revenue: number;
  cogs: number;
  contribution_margin: number;
  fixed_costs: number;
  financial_result: number;
  net_result: number;
  dividends: number;
  partner_bonus: number;
  partner_reimbursement: number;
  cash_generation: number;
  gross_margin_pct: number;
  net_margin_pct: number;
  effective_tax_rate_pct: number;
}

export interface KpiAggregate {
  monthly: MonthlyKpi[];
  ytd: {
    gross_revenue: number;
    net_revenue: number;
    cogs: number;
    fixed_costs: number;
    net_result: number;
    cash_generation: number;
    gross_margin_pct: number;
    net_margin_pct: number;
    effective_tax_rate_pct: number;
  };
}

function aggregate(monthly: MonthlyKpi[]): KpiAggregate {
  const sum = (k: keyof MonthlyKpi) =>
    monthly.reduce<number>((acc, m) => acc + (m[k] as number), 0);

  const gross_revenue = sum("gross_revenue");
  const net_revenue = sum("net_revenue");
  const cogs = sum("cogs");
  const fixed_costs = sum("fixed_costs");
  const net_result = sum("net_result");
  const cash_generation = sum("cash_generation");
  const deductions = sum("revenue_deductions");

  return {
    monthly,
    ytd: {
      gross_revenue,
      net_revenue,
      cogs,
      fixed_costs,
      net_result,
      cash_generation,
      gross_margin_pct: gross_revenue ? ((net_revenue - cogs) / gross_revenue) * 100 : 0,
      net_margin_pct: gross_revenue ? (net_result / gross_revenue) * 100 : 0,
      effective_tax_rate_pct: gross_revenue ? (deductions / gross_revenue) * 100 : 0,
    },
  };
}

export async function fetchKpiDashboard(companyId: string, year: number): Promise<KpiAggregate> {
  const { data, error } = await supabase.rpc("kpi_dashboard", {
    p_company_id: companyId,
    p_year: year,
  });
  if (error) throw error;
  return aggregate(data ?? []);
}

/** `companyIds` nulo = organização inteira; array = recorte de um grupo de agregação. */
export async function fetchKpiDashboardConsolidated(
  organizationId: string,
  year: number,
  companyIds: string[] | null,
): Promise<KpiAggregate> {
  const { data, error } = await supabase.rpc("kpi_dashboard_consolidated", {
    p_organization_id: organizationId,
    p_year: year,
    p_company_ids: companyIds ?? undefined,
  });
  if (error) throw error;
  return aggregate(data ?? []);
}

export interface ExpenseBreakdownRow {
  account_id: string | null;
  account_code: string | null;
  account_name: string;
  total: number;
  is_other: boolean;
}

export async function fetchExpenseBreakdown(opts: {
  companyId: string | null;
  organizationId: string | null;
  companyIds?: string[] | null;
  from: string;
  to: string;
  limit?: number;
}): Promise<ExpenseBreakdownRow[]> {
  const { data, error } = await supabase.rpc("expense_breakdown", {
    p_company_id: opts.companyId ?? undefined,
    p_organization_id: opts.organizationId ?? undefined,
    p_company_ids: opts.companyIds ?? undefined,
    p_start: opts.from,
    p_end: opts.to,
    p_limit: opts.limit ?? 8,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    account_id: r.account_id,
    account_code: r.account_code,
    account_name: r.account_name,
    total: r.total,
    is_other: r.is_other,
  }));
}
