import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deletePayrollMapping,
  fetchPayrollMappings,
  previewPayrollPosting,
  setupPayrollMappingsDefaults,
  upsertPayrollMapping,
  type PayrollMappingInsert,
} from "./api";

export const payrollMappingKeys = {
  list: (companyId: string | null) => ["payroll-mappings", companyId] as const,
  preview: (runId: string | null) => ["payroll-mappings", "preview", runId] as const,
};

export function usePayrollMappings(companyId: string | null) {
  return useQuery({
    queryKey: payrollMappingKeys.list(companyId),
    queryFn: () => fetchPayrollMappings(companyId ?? ""),
    enabled: Boolean(companyId),
  });
}

export function usePayrollPostingPreview(runId: string | null) {
  return useQuery({
    queryKey: payrollMappingKeys.preview(runId),
    queryFn: () => previewPayrollPosting(runId ?? ""),
    enabled: Boolean(runId),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["payroll-mappings"] });
  void qc.invalidateQueries({ queryKey: ["chart-of-accounts"] });
}

export function useSetupDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => setupPayrollMappingsDefaults(companyId),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpsertMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PayrollMappingInsert) => upsertPayrollMapping(payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePayrollMapping(id),
    onSuccess: () => invalidate(qc),
  });
}
