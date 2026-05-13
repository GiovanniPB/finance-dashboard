import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createTransaction,
  fetchTransactions,
  restoreTransaction,
  softDeleteTransaction,
  updateTransaction,
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
