import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import { fetchBankBalances, fetchCashflowDaily, fetchCashflowMonthly } from "./api";
import { withCumulativeBalance } from "./compute";

const scopeKey = (companyIds: string[] | null) => scopeQueryKey(companyIds);

export const cashflowKeys = {
  daily: (companyIds: string[] | null, from: string, to: string) =>
    ["cashflow", "daily", scopeKey(companyIds), from, to] as const,
  monthly: (companyIds: string[] | null, year: number) =>
    ["cashflow", "monthly", scopeKey(companyIds), year] as const,
  banks: (companyId: string, asOf: string) => ["cashflow", "banks", companyId, asOf] as const,
};

export function useCashflowDaily(
  companyIds: string[] | null,
  from: string,
  to: string,
  openingBalance = 0,
) {
  const query = useQuery({
    queryKey: cashflowKeys.daily(companyIds, from, to),
    queryFn: () => fetchCashflowDaily(companyIds, from, to),
    // Recorte vazio (grupo ainda não resolvido) não deve virar "todas as empresas".
    enabled: Boolean(from) && Boolean(to) && (companyIds === null || companyIds.length > 0),
  });
  const data = useMemo(
    () => (query.data ? withCumulativeBalance(query.data, openingBalance) : null),
    [query.data, openingBalance],
  );
  return { ...query, data };
}

export function useCashflowMonthly(companyIds: string[] | null, year: number, openingBalance = 0) {
  const query = useQuery({
    queryKey: cashflowKeys.monthly(companyIds, year),
    queryFn: () => fetchCashflowMonthly(companyIds, year),
    enabled: companyIds === null || companyIds.length > 0,
  });
  const data = useMemo(
    () => (query.data ? withCumulativeBalance(query.data, openingBalance) : null),
    [query.data, openingBalance],
  );
  return { ...query, data };
}

/** Saldo por conta na data `asOf` (ISO YYYY-MM-DD). */
export function useBankBalances(companyId: string | null | undefined, asOf: string) {
  return useQuery({
    queryKey: cashflowKeys.banks(companyId ?? "", asOf),
    queryFn: () => fetchBankBalances(companyId ?? "", asOf),
    enabled: Boolean(companyId) && Boolean(asOf),
  });
}
