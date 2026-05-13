import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createBankAccount,
  fetchBankAccounts,
  toggleBankAccountActive,
  updateBankAccount,
  type BankAccountInsert,
  type BankAccountUpdate,
} from "./api";

export const bankKeys = {
  byCompany: (companyId: string) => ["bank-accounts", companyId] as const,
};

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
    onSuccess: (data) => qc.invalidateQueries({ queryKey: bankKeys.byCompany(data.company_id) }),
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
