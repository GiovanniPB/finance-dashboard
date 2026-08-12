import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteLedgerSettings,
  fetchConnectionGateways,
  fetchCronStatus,
  fetchObservedEventTypes,
  resumeSyncRun,
} from "./api";

export const integrationKeys = {
  observedEvents: () => ["integrations", "observedEvents"] as const,
  cronStatus: () => ["integrations", "cronStatus"] as const,
  connectionGateways: (accountId: string) =>
    ["integrations", "connectionGateways", accountId] as const,
};

export function useConnectionGateways(accountId: string | null) {
  return useQuery({
    queryKey: integrationKeys.connectionGateways(accountId ?? ""),
    queryFn: () => fetchConnectionGateways(accountId ?? ""),
    enabled: Boolean(accountId),
  });
}

export function useObservedEventTypes() {
  return useQuery({
    queryKey: integrationKeys.observedEvents(),
    queryFn: fetchObservedEventTypes,
    // o que já chegou muda devagar; evita varrer 2k eventos a cada render
    staleTime: 60 * 1000,
    // erro aqui é falta de permissão (RLS), não bug: não vale insistir
    retry: false,
  });
}

export function useCronStatus() {
  return useQuery({
    queryKey: integrationKeys.cronStatus(),
    queryFn: fetchCronStatus,
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function useDeleteLedgerSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLedgerSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
  });
}

export function useResumeSyncRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resumeSyncRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales", "syncRuns"] });
    },
  });
}
