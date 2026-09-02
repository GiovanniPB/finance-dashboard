import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { scopeQueryKey } from "@/features/companies/scopeQueryKey";

import {
  createCostCenter,
  fetchConsolidatedCostCenters,
  fetchCostCenters,
  mergeCostCenters,
  unmergeCostCenters,
  updateCostCenter,
  type CostCenterInsert,
  type CostCenterUpdate,
} from "./api";

export const costCenterKeys = {
  byCompany: (companyId: string) => ["cost-centers", companyId] as const,
  consolidated: (scope: string) => ["cost-centers", "consolidated", scope] as const,
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

/** Centros do escopo agrupados pela chave de consolidação. */
export function useConsolidatedCostCenters(companyIds: string[] | null) {
  return useQuery({
    queryKey: costCenterKeys.consolidated(scopeQueryKey(companyIds)),
    queryFn: () => fetchConsolidatedCostCenters(companyIds),
    // Recorte vazio (grupo ainda carregando) não deve buscar o escopo inteiro.
    enabled: companyIds === null || companyIds.length > 0,
  });
}

/** Invalida tudo que depende da chave de consolidação. */
function invalidateCostCenters(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["cost-centers"] });
  // O relatório e o balanço somam PELA chave de consolidação: mudar uma fusão muda o
  // número deles na hora.
  void qc.invalidateQueries({ queryKey: ["reports"] });
  void qc.invalidateQueries({ queryKey: ["balance"] });
}

export function useMergeCostCenters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { organizationId: string; name: string; costCenterIds: string[] }) =>
      mergeCostCenters(input),
    onSuccess: () => invalidateCostCenters(qc),
  });
}

export function useUnmergeCostCenters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (costCenterIds: string[]) => unmergeCostCenters(costCenterIds),
    onSuccess: () => invalidateCostCenters(qc),
  });
}
