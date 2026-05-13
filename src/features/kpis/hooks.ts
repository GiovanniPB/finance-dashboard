import { useQuery } from "@tanstack/react-query";

import { fetchKpiDashboard } from "./api";

export const kpiKeys = {
  dashboard: (companyId: string | null | undefined, year: number) =>
    ["kpis", "dashboard", companyId ?? "none", year] as const,
};

export function useKpiDashboard(companyId: string | null | undefined, year: number) {
  return useQuery({
    queryKey: kpiKeys.dashboard(companyId, year),
    queryFn: () => fetchKpiDashboard(companyId ?? "", year),
    enabled: Boolean(companyId),
  });
}
