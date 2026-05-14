import { useQuery } from "@tanstack/react-query";

import {
  fetchCostCenterAnalysis,
  fetchCounterpartyAnalysis,
  fetchDreComparison,
  type CounterpartyKindFilter,
} from "./api";

export const reportKeys = {
  costCenter: (companyId: string | null, from: string, to: string) =>
    ["reports", "cost-center", companyId, from, to] as const,
  counterparty: (
    companyId: string | null,
    from: string,
    to: string,
    kind: CounterpartyKindFilter,
    limit: number,
  ) => ["reports", "counterparty", companyId, from, to, kind, limit] as const,
  dreComparison: (
    companyId: string | null,
    aFrom: string,
    aTo: string,
    bFrom: string,
    bTo: string,
  ) => ["reports", "dre-comparison", companyId, aFrom, aTo, bFrom, bTo] as const,
};

export function useCostCenterAnalysis(companyId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: reportKeys.costCenter(companyId, from, to),
    queryFn: () => fetchCostCenterAnalysis(companyId ?? "", from, to),
    enabled: Boolean(companyId),
  });
}

export function useCounterpartyAnalysis(
  companyId: string | null,
  from: string,
  to: string,
  kind: CounterpartyKindFilter,
  limit: number,
) {
  return useQuery({
    queryKey: reportKeys.counterparty(companyId, from, to, kind, limit),
    queryFn: () => fetchCounterpartyAnalysis(companyId ?? "", from, to, kind, limit),
    enabled: Boolean(companyId),
  });
}

export function useDreComparison(
  companyId: string | null,
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
) {
  return useQuery({
    queryKey: reportKeys.dreComparison(companyId, aFrom, aTo, bFrom, bTo),
    queryFn: () => fetchDreComparison(companyId ?? "", aFrom, aTo, bFrom, bTo),
    enabled: Boolean(companyId),
  });
}
