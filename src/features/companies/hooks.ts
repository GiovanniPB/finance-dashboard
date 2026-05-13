import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCompany,
  fetchAllCompanies,
  fetchCompanies,
  fetchCompany,
  fetchCompanyStats,
  updateCompany,
  type CompanyInsert,
  type CompanyUpdate,
} from "./api";

export const companyKeys = {
  all: ["companies"] as const,
  allIncludingInactive: ["companies", "all"] as const,
  detail: (id: string) => ["companies", id] as const,
  stats: ["companies", "stats"] as const,
};

export function useCompanies() {
  return useQuery({
    queryKey: companyKeys.all,
    queryFn: fetchCompanies,
  });
}

export function useAllCompanies() {
  return useQuery({
    queryKey: companyKeys.allIncludingInactive,
    queryFn: fetchAllCompanies,
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: companyKeys.detail(id ?? ""),
    queryFn: () => fetchCompany(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useCompanyStats() {
  return useQuery({
    queryKey: companyKeys.stats,
    queryFn: fetchCompanyStats,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CompanyInsert) => createCompany(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.all });
      void qc.invalidateQueries({ queryKey: companyKeys.allIncludingInactive });
      void qc.invalidateQueries({ queryKey: companyKeys.stats });
    },
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CompanyUpdate }) =>
      updateCompany(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.all });
      void qc.invalidateQueries({ queryKey: companyKeys.allIncludingInactive });
      void qc.invalidateQueries({ queryKey: companyKeys.stats });
    },
  });
}
