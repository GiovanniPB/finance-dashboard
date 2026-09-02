import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCostCenter,
  fetchCostCenters,
  mergeCostCenters,
  updateCostCenter,
  type CostCenterInsert,
  type CostCenterUpdate,
} from "./api";

export const costCenterKeys = {
  all: ["cost-centers"] as const,
};

/** A central de custos inteira — global, sem empresa. */
export function useCostCenters() {
  return useQuery({
    queryKey: costCenterKeys.all,
    queryFn: fetchCostCenters,
  });
}

/**
 * Fundir e apagar mudam o que o relatório e o balanço somam, então invalidam os dois
 * junto com a lista — senão a tela mostraria o número de antes da organização.
 */
function invalidateCostCenters(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: costCenterKeys.all });
  void qc.invalidateQueries({ queryKey: ["reports"] });
  void qc.invalidateQueries({ queryKey: ["balance"] });
  void qc.invalidateQueries({ queryKey: ["transactions"] });
}

export function useCreateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CostCenterInsert) => createCostCenter(payload),
    onSuccess: () => invalidateCostCenters(qc),
  });
}

export function useUpdateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CostCenterUpdate }) =>
      updateCostCenter(id, payload),
    onSuccess: () => invalidateCostCenters(qc),
  });
}

export function useMergeCostCenters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sourceIds: string[]; targetId: string }) => mergeCostCenters(input),
    onSuccess: () => invalidateCostCenters(qc),
  });
}
