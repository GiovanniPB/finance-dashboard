import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCompanyGroup,
  deleteCompanyGroup,
  fetchCompanyGroups,
  updateCompanyGroup,
  type SaveCompanyGroupInput,
} from "./api";

export const companyGroupKeys = {
  all: ["company-groups"] as const,
};

export function useCompanyGroups() {
  return useQuery({
    queryKey: companyGroupKeys.all,
    queryFn: fetchCompanyGroups,
  });
}

export function useCreateCompanyGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCompanyGroupInput) => createCompanyGroup(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: companyGroupKeys.all }),
  });
}

export function useUpdateCompanyGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SaveCompanyGroupInput }) =>
      updateCompanyGroup(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: companyGroupKeys.all }),
  });
}

export function useDeleteCompanyGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCompanyGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: companyGroupKeys.all }),
  });
}
