import { useQuery } from "@tanstack/react-query";

import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

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
  companyIds: string[] | null = null,
) {
  const scopeKey = scopeQueryKey(companyIds);
  return useQuery({
    queryKey: [...kpiKeys.consolidated(organizationId, year), scopeKey],
    queryFn: () => fetchKpiDashboardConsolidated(organizationId ?? "", year, companyIds),
    // Recorte vazio não deve virar "todas as empresas": não busca.
    enabled: Boolean(organizationId) && (companyIds === null || companyIds.length > 0),
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
  /** Escopo com mais de uma empresa: consolidado ou grupo de agregação. */
  aggregated: boolean;
  /** Recorte quando `aggregated`: nulo = organização inteira; array = só estas. */
  companyIds: string[] | null;
}): YoYKpis {
  const currentSingle = useKpiDashboard(opts.aggregated ? null : opts.companyId, opts.year);
  const previousSingle = useKpiDashboard(opts.aggregated ? null : opts.companyId, opts.year - 1);
  const currentAggregated = useKpiDashboardConsolidated(
    opts.aggregated ? opts.organizationId : null,
    opts.year,
    opts.companyIds,
  );
  const previousAggregated = useKpiDashboardConsolidated(
    opts.aggregated ? opts.organizationId : null,
    opts.year - 1,
    opts.companyIds,
  );

  const current = opts.aggregated ? currentAggregated : currentSingle;
  const previous = opts.aggregated ? previousAggregated : previousSingle;

  return {
    current: current.data,
    previous: previous.data,
    isLoading: current.isLoading || previous.isLoading,
  };
}

export function useExpenseBreakdown(opts: {
  companyId: string | null;
  organizationId: string | null;
  companyIds?: string[] | null;
  from: string;
  to: string;
}) {
  const scopeKey = scopeQueryKey(opts.companyIds ?? null);
  return useQuery({
    queryKey: [
      ...kpiKeys.expenses(opts.companyId, opts.organizationId, opts.from, opts.to),
      scopeKey,
    ],
    queryFn: () =>
      fetchExpenseBreakdown({
        companyId: opts.companyId,
        organizationId: opts.organizationId,
        companyIds: opts.companyIds ?? null,
        from: opts.from,
        to: opts.to,
      }),
    enabled:
      Boolean(opts.from) &&
      Boolean(opts.to) &&
      (Boolean(opts.companyId) || Boolean(opts.organizationId)),
  });
}
