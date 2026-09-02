import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createBill,
  createInstallments,
  deleteBill,
  fetchAging,
  fetchBills,
  registerPayment,
  updateBill,
} from "./api";
import type {
  BillFilters,
  CreateInstallmentsInput,
  RegisterPaymentInput,
  TransactionInsert,
} from "./types";

export const billKeys = {
  all: ["bills"] as const,
  list: (filters: BillFilters) => ["bills", "list", filters] as const,
  aging: (companyId: string | null, direction: BillFilters["direction"]) =>
    ["bills", "aging", companyId, direction] as const,
};

export function useBills(filters: BillFilters) {
  return useQuery({
    queryKey: billKeys.list(filters),
    queryFn: () => fetchBills(filters),
    placeholderData: keepPreviousData,
  });
}

export function useBillsAging(companyIds: string[] | null, direction: BillFilters["direction"]) {
  return useQuery({
    queryKey: billKeys.aging(companyIds ? [...companyIds].sort().join(",") : null, direction),
    queryFn: () => fetchAging(companyIds, direction),
  });
}

function invalidateBillQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: billKeys.all });
  void qc.invalidateQueries({ queryKey: ["transactions"] });
  void qc.invalidateQueries({ queryKey: ["dre"] });
  void qc.invalidateQueries({ queryKey: ["cashflow"] });
}

export function useCreateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TransactionInsert) => createBill(payload),
    onSuccess: () => invalidateBillQueries(qc),
  });
}

export function useUpdateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TransactionInsert> }) =>
      updateBill(id, payload),
    onSuccess: () => invalidateBillQueries(qc),
  });
}

export function useDeleteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBill(id),
    onSuccess: () => invalidateBillQueries(qc),
  });
}

export function useRegisterPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterPaymentInput) => registerPayment(input),
    onSuccess: () => invalidateBillQueries(qc),
  });
}

export function useCreateInstallments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInstallmentsInput) => createInstallments(input),
    onSuccess: () => invalidateBillQueries(qc),
  });
}
