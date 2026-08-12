import { useQuery } from "@tanstack/react-query";

import {
  fetchLedgerHealth,
  fetchPagarmeAccounts,
  fetchReceivablesSchedule,
  fetchSalesBreakdown,
  fetchSalesCustomers,
  fetchSalesOverview,
  fetchSalesRecurrence,
  fetchSalesTimeseries,
  type SalesDimension,
  type SalesGrain,
} from "./api";

export const salesKeys = {
  accounts: () => ["sales", "accounts"] as const,
  overview: (from: string, to: string, account: string | null) =>
    ["sales", "overview", from, to, account ?? "all"] as const,
  timeseries: (from: string, to: string, grain: SalesGrain, account: string | null) =>
    ["sales", "timeseries", from, to, grain, account ?? "all"] as const,
  breakdown: (from: string, to: string, dim: SalesDimension, account: string | null) =>
    ["sales", "breakdown", from, to, dim, account ?? "all"] as const,
  customers: (from: string, to: string, account: string | null) =>
    ["sales", "customers", from, to, account ?? "all"] as const,
  recurrence: (from: string, to: string, account: string | null) =>
    ["sales", "recurrence", from, to, account ?? "all"] as const,
  receivables: (from: string, to: string, company: string | null) =>
    ["sales", "receivables", from, to, company ?? "all"] as const,
  health: () => ["sales", "health"] as const,
};

export function usePagarmeAccounts() {
  return useQuery({
    queryKey: salesKeys.accounts(),
    queryFn: fetchPagarmeAccounts,
    // conexões mudam raramente; evita refetch a cada troca de filtro
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesOverview(from: string, to: string, accountId: string | null) {
  return useQuery({
    queryKey: salesKeys.overview(from, to, accountId),
    queryFn: () => fetchSalesOverview(from, to, accountId),
  });
}

export function useSalesTimeseries(
  from: string,
  to: string,
  grain: SalesGrain,
  accountId: string | null,
) {
  return useQuery({
    queryKey: salesKeys.timeseries(from, to, grain, accountId),
    queryFn: () => fetchSalesTimeseries(from, to, grain, accountId),
  });
}

export function useSalesBreakdown(
  from: string,
  to: string,
  dimension: SalesDimension,
  accountId: string | null,
) {
  return useQuery({
    queryKey: salesKeys.breakdown(from, to, dimension, accountId),
    queryFn: () => fetchSalesBreakdown(from, to, dimension, accountId),
  });
}

export function useSalesCustomers(from: string, to: string, accountId: string | null) {
  return useQuery({
    queryKey: salesKeys.customers(from, to, accountId),
    queryFn: () => fetchSalesCustomers(from, to, accountId),
  });
}

export function useSalesRecurrence(from: string, to: string, accountId: string | null) {
  return useQuery({
    queryKey: salesKeys.recurrence(from, to, accountId),
    queryFn: () => fetchSalesRecurrence(from, to, accountId),
  });
}

export function useReceivablesSchedule(from: string, to: string, companyId: string | null) {
  return useQuery({
    queryKey: salesKeys.receivables(from, to, companyId),
    queryFn: () => fetchReceivablesSchedule(from, to, companyId),
  });
}

export function useLedgerHealth() {
  return useQuery({
    queryKey: salesKeys.health(),
    queryFn: fetchLedgerHealth,
    staleTime: 60 * 1000,
  });
}
