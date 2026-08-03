import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  countUnassignedSettled,
  createBankAccount,
  createTransfer,
  deleteBankAccount,
  fetchAccountLedger,
  fetchAccountPeriod,
  fetchBalancesMulti,
  fetchBankAccount,
  fetchBankAccounts,
  fetchBankAccountUsage,
  toggleBankAccountActive,
  updateBankAccount,
  type BankAccountInsert,
  type BankAccountUpdate,
  type TransferInput,
} from "./api";

export const bankKeys = {
  byCompany: (companyId: string) => ["bank-accounts", companyId] as const,
  one: (id: string) => ["bank-accounts", "one", id] as const,
  usage: (id: string) => ["bank-accounts", "usage", id] as const,
  balances: (asOf: string, companyIds: string[] | null) =>
    ["bank-accounts", "balances", asOf, companyIds] as const,
  ledger: (id: string, from: string, to: string) =>
    ["bank-accounts", "ledger", id, from, to] as const,
  period: (id: string, from: string, to: string) =>
    ["bank-accounts", "period", id, from, to] as const,
};

/** Saldos das contas em `asOf`. `companyIds` null = todas as empresas acessíveis. */
export function useBalancesMulti(asOf: string, companyIds: string[] | null) {
  return useQuery({
    queryKey: bankKeys.balances(asOf, companyIds),
    queryFn: () => fetchBalancesMulti(asOf, companyIds),
    enabled: Boolean(asOf),
  });
}

/** Lançamentos liquidados sem conta atribuída — ficam fora de todos os saldos. */
export function useUnassignedCount(companyIds: string[] | null) {
  return useQuery({
    queryKey: ["bank-accounts", "unassigned", companyIds] as const,
    queryFn: () => countUnassignedSettled(companyIds),
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferInput) => createTransfer(input),
    onSuccess: () => {
      // A transferência mexe no saldo das duas contas e nas listas de lançamentos.
      void qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}

export function useBankAccount(id: string | null | undefined) {
  return useQuery({
    queryKey: bankKeys.one(id ?? ""),
    queryFn: () => fetchBankAccount(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useAccountLedger(id: string | null | undefined, from: string, to: string) {
  return useQuery({
    queryKey: bankKeys.ledger(id ?? "", from, to),
    queryFn: () => fetchAccountLedger(id ?? "", from, to),
    enabled: Boolean(id) && Boolean(from) && Boolean(to),
  });
}

export function useAccountPeriod(id: string | null | undefined, from: string, to: string) {
  return useQuery({
    queryKey: bankKeys.period(id ?? "", from, to),
    queryFn: () => fetchAccountPeriod(id ?? "", from, to),
    enabled: Boolean(id) && Boolean(from) && Boolean(to),
  });
}

export function useBankAccounts(companyId: string | null) {
  return useQuery({
    queryKey: bankKeys.byCompany(companyId ?? ""),
    queryFn: () => fetchBankAccounts(companyId ?? ""),
    enabled: Boolean(companyId),
  });
}

export function useCreateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BankAccountInsert) => createBankAccount(payload),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: bankKeys.byCompany(data.company_id) }),
  });
}

export function useUpdateBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: BankAccountUpdate }) =>
      updateBankAccount(id, payload),
    onSuccess: () => {
      // Saldo inicial e data do saldo são editáveis, e ambos entram no cálculo
      // feito no banco de saldo por conta, extrato, fluxo de caixa e projeção —
      // invalidar só a lista deixaria esses números defasados na tela.
      void qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
      void qc.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
}

export function useToggleBankAccountActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleBankAccountActive(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-accounts"] }),
  });
}

export function useBankAccountUsage(id: string | null) {
  return useQuery({
    queryKey: bankKeys.usage(id ?? ""),
    queryFn: () => fetchBankAccountUsage(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useDeleteBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBankAccount(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
