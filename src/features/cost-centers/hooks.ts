import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCostCenter,
  fetchCostCenters,
  updateCostCenter,
  type CostCenterInsert,
  type CostCenterUpdate,
} from "./api";

export const costCenterKeys = {
  byCompany: (companyId: string) => ["cost-centers", companyId] as const,
};

export function useCostCenters(companyId: string | null) {
  return useQuery({
    queryKey: costCenterKeys.byCompany(companyId ?? ""),
    queryFn: () => fetchCostCenters(companyId ?? ""),
    enabled: Boolean(companyId),
  });
}

export function useCreateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CostCenterInsert) => createCostCenter(payload),
    onSuccess: (d) => qc.invalidateQueries({ queryKey: costCenterKeys.byCompany(d.company_id) }),
  });
}

export function useUpdateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CostCenterUpdate }) =>
      updateCostCenter(id, payload),
    onSuccess: (d) => qc.invalidateQueries({ queryKey: costCenterKeys.byCompany(d.company_id) }),
  });
}
