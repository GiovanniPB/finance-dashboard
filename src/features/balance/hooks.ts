import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchBalanceModel,
  fetchLineTransactions,
  fetchMonthlySeries,
  saveBalanceModel,
} from "./api";
import type { BalanceDrilldown } from "./compute";
import type { AccountingBasis } from "./drilldown";
import type { BalanceLine } from "./schema";

export const balanceKeys = {
  model: (companyId: string | null) => ["balance", "model", companyId] as const,
  series: (companyId: string | null, from: string, to: string, basis: AccountingBasis) =>
    ["balance", "series", companyId, from, to, basis] as const,
};

export function useBalanceModel(companyId: string | null) {
  return useQuery({
    queryKey: balanceKeys.model(companyId),
    queryFn: () => fetchBalanceModel(companyId ?? ""),
    enabled: Boolean(companyId),
  });
}

export function useMonthlySeries(
  companyId: string | null,
  from: string,
  to: string,
  basis: AccountingBasis,
) {
  return useQuery({
    queryKey: balanceKeys.series(companyId, from, to, basis),
    queryFn: () => fetchMonthlySeries(companyId ?? "", from, to, basis),
    enabled: Boolean(companyId && from && to),
  });
}

export function useSaveBalanceModel(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lines: BalanceLine[]) => saveBalanceModel(companyId ?? "", lines),
    onSuccess: (lines) => qc.setQueryData(balanceKeys.model(companyId), lines),
  });
}

export function useLineTransactions(
  companyId: string | null,
  from: string,
  to: string,
  drilldown: BalanceDrilldown | null,
  basis: AccountingBasis,
) {
  return useQuery({
    queryKey: [
      "balance",
      "line-transactions",
      companyId,
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
      return fetchLineTransactions({ companyId: companyId ?? "", from, to, drilldown, basis });
    },
    enabled: Boolean(companyId && from && to && drilldown),
  });
}
