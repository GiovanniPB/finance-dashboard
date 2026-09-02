import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveRecurringTemplate,
  createRecurringTemplate,
  deleteRecurringTemplate,
  fetchRecurringTemplates,
  generateRecurringTransactions,
  updateRecurringTemplate,
  type RecurringTemplateInsert,
  type RecurringTemplateUpdate,
} from "./api";

export const recurringKeys = {
  list: (companyIds: string[] | null) =>
    ["recurring", companyIds ? [...companyIds].sort().join(",") : "all"] as const,
};

export function useRecurringTemplates(companyIds: string[] | null) {
  return useQuery({
    queryKey: recurringKeys.list(companyIds),
    queryFn: () => fetchRecurringTemplates(companyIds),
  });
}

export function useCreateRecurringTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecurringTemplateInsert) => createRecurringTemplate(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
      void qc.invalidateQueries({ queryKey: ["dre"] });
    },
  });
}

export function useUpdateRecurringTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RecurringTemplateUpdate }) =>
      updateRecurringTemplate(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recurring"] }),
  });
}

export function useDeleteRecurringTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecurringTemplate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recurring"] }),
  });
}

export function useApproveRecurringTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveRecurringTemplate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
      void qc.invalidateQueries({ queryKey: ["dre"] });
    },
  });
}

export function useGenerateRecurringTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (throughDate?: string) => generateRecurringTransactions(throughDate),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
      void qc.invalidateQueries({ queryKey: ["dre"] });
    },
  });
}
