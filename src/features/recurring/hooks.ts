import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createRecurringTemplate,
  deleteRecurringTemplate,
  fetchRecurringTemplates,
  updateRecurringTemplate,
  type RecurringTemplateInsert,
  type RecurringTemplateUpdate,
} from "./api";

export const recurringKeys = {
  list: (companyId: string | null) => ["recurring", companyId ?? "all"] as const,
};

export function useRecurringTemplates(companyId: string | null) {
  return useQuery({
    queryKey: recurringKeys.list(companyId),
    queryFn: () => fetchRecurringTemplates(companyId),
  });
}

export function useCreateRecurringTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecurringTemplateInsert) => createRecurringTemplate(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recurring"] }),
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
