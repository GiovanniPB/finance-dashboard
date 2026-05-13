import { useQuery } from "@tanstack/react-query";

import { fetchCompanies, fetchCompany } from "./api";

export const companyKeys = {
  all: ["companies"] as const,
  detail: (id: string) => ["companies", id] as const,
};

export function useCompanies() {
  return useQuery({
    queryKey: companyKeys.all,
    queryFn: fetchCompanies,
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: companyKeys.detail(id ?? ""),
    queryFn: () => fetchCompany(id ?? ""),
    enabled: Boolean(id),
  });
}
