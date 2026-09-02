import { useQuery } from "@tanstack/react-query";

import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import {
  fetchCostCenterAnalysis,
  fetchCounterpartyAnalysis,
  fetchDreComparison,
  fetchDreComparisonConsolidated,
  type CounterpartyKindFilter,
} from "./api";

export const reportKeys = {
  costCenter: (scope: string, from: string, to: string) =>
    ["reports", "cost-center", scope, from, to] as const,
  counterparty: (
    scope: string,
    from: string,
    to: string,
    kind: CounterpartyKindFilter,
    limit: number,
  ) => ["reports", "counterparty", scope, from, to, kind, limit] as const,
  dreComparison: (scope: string, aFrom: string, aTo: string, bFrom: string, bTo: string) =>
    ["reports", "dre-comparison", scope, aFrom, aTo, bFrom, bTo] as const,
};

/**
 * Recorte vazio significa "nenhuma empresa", não "todas": um grupo ainda carregando
 * não pode disparar a consulta do escopo inteiro sob o rótulo do recorte.
 */
const scopeReady = (companyIds: string[] | null) => companyIds === null || companyIds.length > 0;

export function useCostCenterAnalysis(companyIds: string[] | null, from: string, to: string) {
  return useQuery({
    queryKey: reportKeys.costCenter(scopeQueryKey(companyIds), from, to),
    queryFn: () => fetchCostCenterAnalysis(companyIds, from, to),
    enabled: scopeReady(companyIds) && Boolean(from) && Boolean(to),
  });
}

export function useCounterpartyAnalysis(
  companyIds: string[] | null,
  from: string,
  to: string,
  kind: CounterpartyKindFilter,
  limit: number,
) {
  return useQuery({
    queryKey: reportKeys.counterparty(scopeQueryKey(companyIds), from, to, kind, limit),
    queryFn: () => fetchCounterpartyAnalysis(companyIds, from, to, kind, limit),
    enabled: scopeReady(companyIds) && Boolean(from) && Boolean(to),
  });
}

/**
 * Comparativo de DRE do escopo. Empresa única usa o plano DELA; qualquer escopo com
 * mais de uma empresa agrega pelo plano-mestre — a mesma divisão do `/dre`.
 */
export function useDreComparison(opts: {
  companyId: string | null;
  organizationId: string;
  companyIds: string[] | null;
  aggregated: boolean;
  aFrom: string;
  aTo: string;
  bFrom: string;
  bTo: string;
}) {
  const { companyId, organizationId, companyIds, aggregated, aFrom, aTo, bFrom, bTo } = opts;

  const single = useQuery({
    queryKey: reportKeys.dreComparison(companyId ?? "none", aFrom, aTo, bFrom, bTo),
    queryFn: () => fetchDreComparison(companyId ?? "", aFrom, aTo, bFrom, bTo),
    enabled: !aggregated && Boolean(companyId) && Boolean(aFrom) && Boolean(bFrom),
  });

  const consolidated = useQuery({
    queryKey: [
      ...reportKeys.dreComparison(scopeQueryKey(companyIds), aFrom, aTo, bFrom, bTo),
      "master",
    ],
    queryFn: () =>
      fetchDreComparisonConsolidated(organizationId, aFrom, aTo, bFrom, bTo, companyIds),
    enabled:
      aggregated &&
      Boolean(organizationId) &&
      scopeReady(companyIds) &&
      Boolean(aFrom) &&
      Boolean(bFrom),
  });

  return aggregated ? consolidated : single;
}
