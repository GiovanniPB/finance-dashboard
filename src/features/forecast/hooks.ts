import { useQuery } from "@tanstack/react-query";

import { fetchForecast } from "./api";

export const forecastKeys = {
  daily: (companyId: string | null, from: string, to: string) =>
    ["forecast", "daily", companyId, from, to] as const,
};

export function useForecast(companyId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: forecastKeys.daily(companyId, from, to),
    queryFn: () => fetchForecast(companyId ?? "", from, to),
    enabled: Boolean(companyId),
  });
}
