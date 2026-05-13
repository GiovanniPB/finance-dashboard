import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCounterparty,
  fetchCounterparties,
  updateCounterparty,
  type CounterpartyFilters,
  type CounterpartyInsert,
  type CounterpartyUpdate,
} from "./api";

export const counterpartyKeys = {
  list: (f: CounterpartyFilters) => ["counterparties", "list", f] as const,
};

export function useCounterparties(filters: CounterpartyFilters) {
  return useQuery({
    queryKey: counterpartyKeys.list(filters),
    queryFn: () => fetchCounterparties(filters),
    enabled: Boolean(filters.organizationId),
  });
}

export function useCreateCounterparty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CounterpartyInsert) => createCounterparty(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counterparties"] }),
  });
}

export function useUpdateCounterparty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CounterpartyUpdate }) =>
      updateCounterparty(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counterparties"] }),
  });
}
