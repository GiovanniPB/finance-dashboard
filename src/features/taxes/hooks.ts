import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Tables } from "@/lib/supabase";

import {
  deleteTaxObligation,
  fetchTaxObligations,
  generateTaxObligations,
  markOverdueObligations,
  markTaxPaid,
  updateTaxObligation,
  type ListFilters,
  type MarkPaidInput,
} from "./api";

export const taxKeys = {
  list: (f: ListFilters) => ["taxes", "list", f] as const,
};

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["taxes"] });
  void qc.invalidateQueries({ queryKey: ["transactions"] });
  void qc.invalidateQueries({ queryKey: ["bills"] });
  void qc.invalidateQueries({ queryKey: ["dre"] });
}

const EMPTY_FILTERS: ListFilters = { companyId: "" };

export function useTaxObligations(filters: ListFilters | null) {
  const effective = filters ?? EMPTY_FILTERS;
  return useQuery({
    queryKey: taxKeys.list(effective),
    queryFn: () => fetchTaxObligations(effective),
    enabled: Boolean(filters?.companyId),
  });
}

export function useGenerateTaxObligations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, referencePeriod }: { companyId: string; referencePeriod: string }) =>
      generateTaxObligations(companyId, referencePeriod),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useMarkTaxPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MarkPaidInput) => markTaxPaid(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateTaxObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Tables["tax_obligations"]["Update"]>;
    }) => updateTaxObligation(id, payload),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteTaxObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTaxObligation(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useMarkOverdue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => markOverdueObligations(companyId),
    onSuccess: () => invalidateAll(qc),
  });
}
