import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createChartAccount,
  deleteChartAccount,
  fetchChartAccounts,
  updateChartAccount,
  type ChartAccountInsert,
  type ChartAccountUpdate,
} from "./api";

export const chartAccountKeys = {
  list: (companyId: string | null) => ["chart-of-accounts", "list", companyId] as const,
};

export function useChartAccounts(companyId: string | null) {
  return useQuery({
    queryKey: chartAccountKeys.list(companyId),
    queryFn: () => fetchChartAccounts(companyId ?? ""),
    enabled: Boolean(companyId),
  });
}

export function useCreateChartAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChartAccountInsert) => createChartAccount(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-of-accounts"] }),
  });
}

export function useUpdateChartAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ChartAccountUpdate }) =>
      updateChartAccount(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-of-accounts"] }),
  });
}

export function useDeleteChartAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChartAccount(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chart-of-accounts"] });
      void qc.invalidateQueries({ queryKey: ["dre"] });
    },
  });
}
