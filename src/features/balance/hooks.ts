import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import {
  fetchBalanceModel,
  fetchLineTransactions,
  fetchMonthlySeries,
  saveBalanceModel,
} from "./api";
import type { BalanceDrilldown } from "./compute";
import type { AccountingBasis } from "./drilldown";
import type { BalanceLine } from "./schema";
import { balanceScopeKey, type BalanceScope } from "./scope";

export const balanceKeys = {
  model: (scope: string) => ["balance", "model", scope] as const,
  series: (scope: string, from: string, to: string, basis: AccountingBasis) =>
    ["balance", "series", scope, from, to, basis] as const,
};

/** Recorte vazio = nenhuma empresa, não todas (grupo ainda carregando). */
const scopeReady = (companyIds: string[] | null) => companyIds === null || companyIds.length > 0;

export function useBalanceModel(scope: BalanceScope, organizationId: string) {
  return useQuery({
    queryKey: balanceKeys.model(balanceScopeKey(scope)),
    queryFn: () => fetchBalanceModel(scope, organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useMonthlySeries(
  companyIds: string[] | null,
  from: string,
  to: string,
  basis: AccountingBasis,
) {
  return useQuery({
    queryKey: balanceKeys.series(scopeQueryKey(companyIds), from, to, basis),
    queryFn: () => fetchMonthlySeries(companyIds, from, to, basis),
    enabled: scopeReady(companyIds) && Boolean(from) && Boolean(to),
  });
}

export function useSaveBalanceModel(scope: BalanceScope, organizationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lines: BalanceLine[]) => saveBalanceModel(scope, organizationId, lines),
    onSuccess: (lines) => qc.setQueryData(balanceKeys.model(balanceScopeKey(scope)), lines),
  });
}

export function useLineTransactions(
  companyIds: string[] | null,
  from: string,
  to: string,
  drilldown: BalanceDrilldown | null,
  basis: AccountingBasis,
) {
  return useQuery({
    queryKey: [
      "balance",
      "line-transactions",
      scopeQueryKey(companyIds),
      from,
      to,
      basis,
      // O drilldown é um objeto: serializa para a chave não virar sempre a mesma.
      drilldown == null ? null : JSON.stringify(drilldown),
    ] as const,
    queryFn: () => {
      // Nunca roda com `drilldown` nulo (ver `enabled`); o guarda existe para o
      // tipo, não como caminho real.
      if (!drilldown) return { rows: [], totalCount: 0 };
      return fetchLineTransactions({ companyIds, from, to, drilldown, basis });
    },
    enabled: scopeReady(companyIds) && Boolean(from) && Boolean(to) && Boolean(drilldown),
  });
}
