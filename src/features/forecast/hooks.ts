import { useQuery } from "@tanstack/react-query";

import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import { fetchForecast } from "./api";

export const forecastKeys = {
  daily: (companyId: string | null, from: string, to: string) =>
    ["forecast", "daily", companyId, from, to] as const,
};

export function useForecast(companyIds: string[] | null, from: string, to: string) {
  return useQuery({
    queryKey: forecastKeys.daily(scopeQueryKey(companyIds), from, to),
    queryFn: () => fetchForecast(companyIds, from, to),
    // Recorte vazio não deve virar "todas as empresas".
    enabled: companyIds === null || companyIds.length > 0,
  });
}
