import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createEmployee,
  deleteEmployee,
  fetchEmployees,
  updateEmployee,
  type EmployeeFilters,
  type EmployeeInsert,
  type EmployeeUpdate,
} from "./api";

export const employeeKeys = {
  list: (f: EmployeeFilters) => ["employees", "list", f] as const,
};

export function useEmployees(filters: EmployeeFilters) {
  return useQuery({
    queryKey: employeeKeys.list(filters),
    queryFn: () => fetchEmployees(filters),
    enabled: Boolean(filters.companyId),
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EmployeeInsert) => createEmployee(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EmployeeUpdate }) =>
      updateEmployee(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}
