import { useQuery } from "@tanstack/react-query";

import {
  fetchExpenseBreakdown,
  fetchKpiDashboard,
  fetchKpiDashboardConsolidated,
  type KpiAggregate,
} from "./api";

export const kpiKeys = {
  dashboard: (companyId: string | null | undefined, year: number) =>
    ["kpis", "dashboard", companyId ?? "none", year] as const,
  consolidated: (orgId: string | null | undefined, year: number) =>
    ["kpis", "consolidated", orgId ?? "none", year] as const,
  expenses: (companyId: string | null, orgId: string | null, from: string, to: string) =>
    ["kpis", "expenses", companyId ?? "", orgId ?? "", from, to] as const,
};

export function useKpiDashboard(companyId: string | null | undefined, year: number) {
  return useQuery({
    queryKey: kpiKeys.dashboard(companyId, year),
    queryFn: () => fetchKpiDashboard(companyId ?? "", year),
    enabled: Boolean(companyId),
  });
}

export function useKpiDashboardConsolidated(
  organizationId: string | null | undefined,
  year: number,
) {
  return useQuery({
    queryKey: kpiKeys.consolidated(organizationId, year),
    queryFn: () => fetchKpiDashboardConsolidated(organizationId ?? "", year),
    enabled: Boolean(organizationId),
  });
}

export interface YoYKpis {
  current: KpiAggregate | undefined;
  previous: KpiAggregate | undefined;
  isLoading: boolean;
}

/**
 * Fetches current + previous year KPIs in parallel for YoY comparisons.
 * Works for both single company and consolidated scope.
 */
export function useKpiYoY(opts: {
  companyId: string | null | undefined;
  organizationId: string | null | undefined;
  year: number;
  consolidated: boolean;
}): YoYKpis {
  const currentSingle = useKpiDashboard(opts.consolidated ? null : opts.companyId, opts.year);
  const previousSingle = useKpiDashboard(opts.consolidated ? null : opts.companyId, opts.year - 1);
  const currentConsolidated = useKpiDashboardConsolidated(
    opts.consolidated ? opts.organizationId : null,
    opts.year,
  );
  const previousConsolidated = useKpiDashboardConsolidated(
    opts.consolidated ? opts.organizationId : null,
    opts.year - 1,
  );

  const current = opts.consolidated ? currentConsolidated : currentSingle;
  const previous = opts.consolidated ? previousConsolidated : previousSingle;

  return {
    current: current.data,
    previous: previous.data,
    isLoading: current.isLoading || previous.isLoading,
  };
}

export function useExpenseBreakdown(opts: {
  companyId: string | null;
  organizationId: string | null;
  from: string;
  to: string;
}) {
  return useQuery({
    queryKey: kpiKeys.expenses(opts.companyId, opts.organizationId, opts.from, opts.to),
    queryFn: () =>
      fetchExpenseBreakdown({
        companyId: opts.companyId,
        organizationId: opts.organizationId,
        from: opts.from,
        to: opts.to,
      }),
    enabled:
      Boolean(opts.from) &&
      Boolean(opts.to) &&
      (Boolean(opts.companyId) || Boolean(opts.organizationId)),
  });
}
