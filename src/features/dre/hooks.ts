import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import { fetchDreByCompany, fetchDreConsolidated } from "./api";
import { computeDreTotals } from "./compute";

export const dreKeys = {
  byCompany: (companyId: string, from: string, to: string) =>
    ["dre", "by-company", companyId, from, to] as const,
  consolidated: (organizationId: string, from: string, to: string) =>
    ["dre", "consolidated", organizationId, from, to] as const,
};

export function useDreByCompany(companyId: string | null | undefined, from: string, to: string) {
  const query = useQuery({
    queryKey: dreKeys.byCompany(companyId ?? "", from, to),
    queryFn: () => fetchDreByCompany(companyId ?? "", from, to),
    enabled: Boolean(companyId) && Boolean(from) && Boolean(to),
  });

  const computed = useMemo(() => (query.data ? computeDreTotals(query.data) : null), [query.data]);

  return { ...query, data: computed };
}

export function useDreConsolidated(
  organizationId: string | null | undefined,
  from: string,
  to: string,
  companyIds: string[] | null = null,
) {
  const scopeKey = scopeQueryKey(companyIds);
  const query = useQuery({
    queryKey: [...dreKeys.consolidated(organizationId ?? "", from, to), scopeKey],
    queryFn: () => fetchDreConsolidated(organizationId ?? "", from, to, companyIds),
    // Recorte vazio (grupo ainda não resolvido) não vira "todas as empresas": não busca.
    enabled:
      Boolean(organizationId) &&
      Boolean(from) &&
      Boolean(to) &&
      (companyIds === null || companyIds.length > 0),
  });

  const computed = useMemo(() => (query.data ? computeDreTotals(query.data) : null), [query.data]);

  return { ...query, data: computed };
}
