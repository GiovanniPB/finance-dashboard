import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPayrollRun,
  deletePayrollItem,
  deletePayrollRun,
  fetchPayrollItems,
  fetchPayrollRun,
  fetchPayrollRuns,
  postPayrollRun,
  updatePayrollItem,
  type PayrollItemUpdate,
} from "./api";

export const payrollKeys = {
  runs: (companyId: string) => ["payroll", "runs", companyId] as const,
  run: (id: string) => ["payroll", "run", id] as const,
  items: (runId: string) => ["payroll", "items", runId] as const,
};

export function usePayrollRuns(companyId: string | null) {
  return useQuery({
    queryKey: payrollKeys.runs(companyId ?? ""),
    queryFn: () => fetchPayrollRuns(companyId ?? ""),
    enabled: Boolean(companyId),
  });
}

export function usePayrollRun(id: string | undefined) {
  return useQuery({
    queryKey: payrollKeys.run(id ?? ""),
    queryFn: () => fetchPayrollRun(id ?? ""),
    enabled: Boolean(id),
  });
}

export function usePayrollItems(runId: string | undefined) {
  return useQuery({
    queryKey: payrollKeys.items(runId ?? ""),
    queryFn: () => fetchPayrollItems(runId ?? ""),
    enabled: Boolean(runId),
  });
}

export function useCreatePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, referenceMonth }: { companyId: string; referenceMonth: string }) =>
      createPayrollRun(companyId, referenceMonth),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["payroll"] }),
  });
}

export function useUpdatePayrollItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PayrollItemUpdate }) =>
      updatePayrollItem(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["payroll"] }),
  });
}

export function useDeletePayrollItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePayrollItem(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["payroll"] }),
  });
}

export function useDeletePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => deletePayrollRun(runId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payroll"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["kpis"] });
      void qc.invalidateQueries({ queryKey: ["dre"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}

export function usePostPayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, defaultAccountId }: { runId: string; defaultAccountId: string }) =>
      postPayrollRun(runId, defaultAccountId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["payroll"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["kpis"] });
      void qc.invalidateQueries({ queryKey: ["dre"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}
