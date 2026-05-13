import { useQuery } from "@tanstack/react-query";

import { fetchAccountsByCompany } from "./api";

export const accountKeys = {
  byCompany: (companyId: string | null | undefined) =>
    ["accounts", "by-company", companyId ?? "none"] as const,
};

export function useAccountsByCompany(companyId: string | null | undefined) {
  return useQuery({
    queryKey: accountKeys.byCompany(companyId),
    queryFn: () => fetchAccountsByCompany(companyId ?? ""),
    enabled: Boolean(companyId),
  });
}
