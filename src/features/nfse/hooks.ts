import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Tables } from "@/lib/supabase";

import {
  createConnection,
  createRecipient,
  deleteRecipient,
  fetchConnections,
  fetchFiscalSettings,
  fetchRecipients,
  updateConnection,
  updateRecipient,
  upsertFiscalSettings,
} from "./api";

export const nfseKeys = {
  connections: ["nfse", "connections"] as const,
  recipients: (accountId: string) => ["nfse", "recipients", accountId] as const,
  fiscalSettings: ["nfse", "fiscal-settings"] as const,
};

// --- Conexões ---------------------------------------------------------------
export function useConnections() {
  return useQuery({ queryKey: nfseKeys.connections, queryFn: fetchConnections });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Tables["pagarme_accounts"]["Insert"]) => createConnection(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.connections }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Tables["pagarme_accounts"]["Update"] }) =>
      updateConnection(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.connections }),
  });
}

// --- Recebedores ------------------------------------------------------------
export function useRecipients(accountId: string | null) {
  return useQuery({
    queryKey: nfseKeys.recipients(accountId ?? ""),
    queryFn: () => fetchRecipients(accountId ?? ""),
    enabled: Boolean(accountId),
  });
}

export function useCreateRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Tables["pagarme_recipient_map"]["Insert"]) => createRecipient(payload),
    onSuccess: (row) =>
      void qc.invalidateQueries({ queryKey: nfseKeys.recipients(row.pagarme_account_id) }),
  });
}

export function useUpdateRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Tables["pagarme_recipient_map"]["Update"];
    }) => updateRecipient(id, payload),
    onSuccess: (row) =>
      void qc.invalidateQueries({ queryKey: nfseKeys.recipients(row.pagarme_account_id) }),
  });
}

export function useDeleteRecipient(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecipient(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.recipients(accountId) }),
  });
}

// --- Configuração fiscal ----------------------------------------------------
export function useFiscalSettings() {
  return useQuery({ queryKey: nfseKeys.fiscalSettings, queryFn: fetchFiscalSettings });
}

export function useUpsertFiscalSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Tables["fiscal_company_settings"]["Insert"]) =>
      upsertFiscalSettings(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.fiscalSettings }),
  });
}
