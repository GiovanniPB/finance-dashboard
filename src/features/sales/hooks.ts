import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import {
  fetchGatewayAccounts,
  fetchLedgerHealth,
  fetchPagarmeAccounts,
  fetchPagarmeForecast,
  fetchReceivablesOfTransaction,
  fetchReceivablesSchedule,
  fetchReconcileMonth,
  fetchSalesBreakdown,
  fetchSalesCustomers,
  fetchSalesOverview,
  fetchSalesRecurrence,
  fetchSalesTimeseries,
  fetchSyncRuns,
  projectLedger,
  reconcilePayout,
  setProjectionEnabled,
  setupGatewayAccount,
  startBackfill,
  type SalesDimension,
  type SalesGrain,
} from "./api";

/**
 * Trocar ano/mês/granularidade/conexão re-consulta as seis RPCs de uma vez. Sem
 * isto, cada troca de filtro joga o dashboard inteiro para o esqueleto; com o
 * dado anterior no lugar, a tela só se atualiza quando o novo chega.
 */
const FILTRAVEL = { placeholderData: keepPreviousData } as const;

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
    ...FILTRAVEL,
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
    ...FILTRAVEL,
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
    ...FILTRAVEL,
  });
}

export function useSalesCustomers(from: string, to: string, accountId: string | null) {
  return useQuery({
    queryKey: salesKeys.customers(from, to, accountId),
    queryFn: () => fetchSalesCustomers(from, to, accountId),
    ...FILTRAVEL,
  });
}

export function useSalesRecurrence(from: string, to: string, accountId: string | null) {
  return useQuery({
    queryKey: salesKeys.recurrence(from, to, accountId),
    queryFn: () => fetchSalesRecurrence(from, to, accountId),
    ...FILTRAVEL,
  });
}

export function useReceivablesSchedule(from: string, to: string, companyIds: string[] | null) {
  return useQuery({
    queryKey: salesKeys.receivables(from, to, scopeQueryKey(companyIds)),
    queryFn: () => fetchReceivablesSchedule(from, to, companyIds),
    ...FILTRAVEL,
  });
}

export function useLedgerHealth() {
  return useQuery({
    queryKey: salesKeys.health(),
    queryFn: fetchLedgerHealth,
    staleTime: 60 * 1000,
  });
}

export const ledgerKeys = {
  receivablesOf: (transactionId: string) => ["sales", "receivablesOf", transactionId] as const,
  forecast: (companyId: string | null, from: string, to: string) =>
    ["sales", "forecast", companyId ?? "none", from, to] as const,
  gateways: (companyId: string | null) => ["sales", "gateways", companyId ?? "none"] as const,
  reconcileMonth: (companyId: string | null, month: string) =>
    ["sales", "reconcileMonth", companyId ?? "none", month] as const,
};

export function useReceivablesOfTransaction(transactionId: string | null) {
  return useQuery({
    queryKey: ledgerKeys.receivablesOf(transactionId ?? ""),
    queryFn: () => fetchReceivablesOfTransaction(transactionId ?? ""),
    enabled: Boolean(transactionId),
  });
}

export function usePagarmeForecast(companyIds: string[] | null, from: string, to: string) {
  return useQuery({
    queryKey: ledgerKeys.forecast(scopeQueryKey(companyIds), from, to),
    queryFn: () => fetchPagarmeForecast(companyIds, from, to),
    enabled: companyIds === null || companyIds.length > 0,
  });
}

export function useGatewayAccounts(companyId: string | null) {
  return useQuery({
    queryKey: ledgerKeys.gateways(companyId),
    queryFn: () => fetchGatewayAccounts(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useReconcileMonth(companyId: string | null, month: string) {
  return useQuery({
    queryKey: ledgerKeys.reconcileMonth(companyId, month),
    queryFn: () => fetchReconcileMonth(companyId ?? "", month),
    enabled: Boolean(companyId),
  });
}

export function useSyncRuns() {
  return useQuery({
    queryKey: ["sales", "syncRuns"] as const,
    queryFn: fetchSyncRuns,
    // enquanto um lote drena, o progresso vem do cron (a cada 2 min): acompanhar
    // de perto não custa nada e é o único feedback da carga histórica
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 15_000 : false,
  });
}

export function useStartBackfill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { accountId: string; windowStart: string; windowEnd: string }) =>
      startBackfill(input.accountId, input.windowStart, input.windowEnd),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales", "syncRuns"] });
    },
  });
}

export function useSetupGateway() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setupGatewayAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      // adotar uma conta muda o tipo dela (para `payment_gateway`)
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
  });
}

export function useSetProjectionEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { settingsId: string; enabled: boolean }) =>
      setProjectionEnabled(input.settingsId, input.enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
  });
}

export function useProjectLedger() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      companyId: string;
      from: string;
      to: string;
      accountId?: string | null;
    }) => projectLedger(input.companyId, input.from, input.to, input.accountId ?? null),
    onSuccess: () => {
      // a projeção cria/atualiza lançamentos: tudo que soma transações muda
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["bills"] });
      void queryClient.invalidateQueries({ queryKey: ["forecast"] });
      void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      void queryClient.invalidateQueries({ queryKey: ["dre"] });
    },
  });
}

export function useReconcilePayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reconcilePayout,
    onSuccess: () => {
      // o saque cria transferência e move saldo: invalida o que depende disso
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}
