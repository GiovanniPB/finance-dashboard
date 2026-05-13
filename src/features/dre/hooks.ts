import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

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
) {
  const query = useQuery({
    queryKey: dreKeys.consolidated(organizationId ?? "", from, to),
    queryFn: () => fetchDreConsolidated(organizationId ?? "", from, to),
    enabled: Boolean(organizationId) && Boolean(from) && Boolean(to),
  });

  const computed = useMemo(() => (query.data ? computeDreTotals(query.data) : null), [query.data]);

  return { ...query, data: computed };
}
