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

export async function fetchKpiDashboard(companyId: string, year: number): Promise<KpiAggregate> {
  const { data, error } = await supabase.rpc("kpi_dashboard", {
    p_company_id: companyId,
    p_year: year,
  });
  if (error) throw error;

  const monthly: MonthlyKpi[] = data ?? [];

  // YTD aggregation
  const sum = (k: keyof MonthlyKpi) =>
    monthly.reduce<number>((acc, m) => acc + (m[k] as number), 0);

  const gross_revenue = sum("gross_revenue");
  const net_revenue = sum("net_revenue");
  const cogs = sum("cogs");
  const fixed_costs = sum("fixed_costs");
  const net_result = sum("net_result");
  const cash_generation = sum("cash_generation");
  const deductions = sum("revenue_deductions");

  const ytd = {
    gross_revenue,
    net_revenue,
    cogs,
    fixed_costs,
    net_result,
    cash_generation,
    gross_margin_pct: gross_revenue ? ((net_revenue - cogs) / gross_revenue) * 100 : 0,
    net_margin_pct: gross_revenue ? (net_result / gross_revenue) * 100 : 0,
    effective_tax_rate_pct: gross_revenue ? (deductions / gross_revenue) * 100 : 0,
  };

  return { monthly, ytd };
}
