import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchBankBalances, fetchCashflowDaily, fetchCashflowMonthly } from "./api";
import { withCumulativeBalance } from "./compute";

export const cashflowKeys = {
  daily: (companyId: string, from: string, to: string) =>
    ["cashflow", "daily", companyId, from, to] as const,
  monthly: (companyId: string, year: number) => ["cashflow", "monthly", companyId, year] as const,
  banks: (companyId: string, refMonth: string) =>
    ["cashflow", "banks", companyId, refMonth] as const,
};

export function useCashflowDaily(
  companyId: string | null | undefined,
  from: string,
  to: string,
  openingBalance = 0,
) {
  const query = useQuery({
    queryKey: cashflowKeys.daily(companyId ?? "", from, to),
    queryFn: () => fetchCashflowDaily(companyId ?? "", from, to),
    enabled: Boolean(companyId) && Boolean(from) && Boolean(to),
  });
  const data = useMemo(
    () => (query.data ? withCumulativeBalance(query.data, openingBalance) : null),
    [query.data, openingBalance],
  );
  return { ...query, data };
}

export function useCashflowMonthly(
  companyId: string | null | undefined,
  year: number,
  openingBalance = 0,
) {
  const query = useQuery({
    queryKey: cashflowKeys.monthly(companyId ?? "", year),
    queryFn: () => fetchCashflowMonthly(companyId ?? "", year),
    enabled: Boolean(companyId),
  });
  const data = useMemo(
    () => (query.data ? withCumulativeBalance(query.data, openingBalance) : null),
    [query.data, openingBalance],
  );
  return { ...query, data };
}

export function useBankBalances(companyId: string | null | undefined, referenceMonth: string) {
  return useQuery({
    queryKey: cashflowKeys.banks(companyId ?? "", referenceMonth),
    queryFn: () => fetchBankBalances(companyId ?? "", referenceMonth),
    enabled: Boolean(companyId) && Boolean(referenceMonth),
  });
}
