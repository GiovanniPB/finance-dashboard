import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  bulkUpdateTransactions,
  createTransaction,
  fetchTransactionIds,
  fetchTransactions,
  restoreTransaction,
  softDeleteTransaction,
  updateTransaction,
  type BulkPatch,
} from "./api";
import type { TransactionFilters, TransactionInsert, TransactionUpdate } from "./types";

export const transactionKeys = {
  all: ["transactions"] as const,
  list: (filters: TransactionFilters) => ["transactions", "list", filters] as const,
  detail: (id: string) => ["transactions", "detail", id] as const,
};

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: transactionKeys.list(filters),
    queryFn: () => fetchTransactions(filters),
    placeholderData: keepPreviousData,
  });
}

export function useBulkUpdateTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: BulkPatch }) =>
      bulkUpdateTransactions(ids, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transactionKeys.all });
      // Mexer em conta bancária ou status muda saldos, fluxo e DRE.
      void qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
      void qc.invalidateQueries({ queryKey: ["dre"] });
    },
  });
}

/** Busca os ids de tudo que bate com o filtro, para "selecionar todos". */
export function useTransactionIds() {
  return useMutation({
    mutationFn: (filters: TransactionFilters) => fetchTransactionIds(filters),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TransactionInsert) => createTransaction(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: transactionKeys.all }),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TransactionUpdate }) =>
      updateTransaction(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: transactionKeys.all }),
  });
}

export function useSoftDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteTransaction(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: transactionKeys.all }),
  });
}

export function useRestoreTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreTransaction(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: transactionKeys.all }),
  });
}
