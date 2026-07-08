import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Tables } from "@/lib/supabase";

import {
  approveInvoiceJob,
  createConnection,
  createRecipient,
  createSandboxCharge,
  deleteRecipient,
  fetchConnections,
  fetchFiscalSettings,
  fetchInvoiceJobs,
  fetchRecipients,
  fetchWebhookEvents,
  requeueInvoiceJob,
  rotateWebhookSecret,
  setFocusToken,
  setPagarmeAccountSecret,
  updateConnection,
  updateRecipient,
  upsertFiscalSettings,
  type InvoiceJobFilters,
  type SandboxChargeInput,
  type WebhookFilters,
} from "./api";

export const nfseKeys = {
  connections: ["nfse", "connections"] as const,
  recipients: (accountId: string) => ["nfse", "recipients", accountId] as const,
  fiscalSettings: ["nfse", "fiscal-settings"] as const,
  jobs: (f: InvoiceJobFilters) => ["nfse", "jobs", f] as const,
  webhooks: (f: WebhookFilters) => ["nfse", "webhooks", f] as const,
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

export function useRotateWebhookSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => rotateWebhookSecret(accountId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.connections }),
  });
}

export function useSetPagarmeAccountSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, secret }: { accountId: string; secret: string }) =>
      setPagarmeAccountSecret(accountId, secret),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.connections }),
  });
}

// --- Cobrança de teste (sandbox) --------------------------------------------
export function useCreateSandboxCharge() {
  return useMutation({
    mutationFn: (input: SandboxChargeInput) => createSandboxCharge(input),
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

export function useSetFocusToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, token }: { companyId: string; token: string }) =>
      setFocusToken(companyId, token),
    onSuccess: () => void qc.invalidateQueries({ queryKey: nfseKeys.fiscalSettings }),
  });
}

// --- Fila de notas ----------------------------------------------------------
export function useInvoiceJobs(filters: InvoiceJobFilters) {
  return useQuery({ queryKey: nfseKeys.jobs(filters), queryFn: () => fetchInvoiceJobs(filters) });
}

export function useApproveInvoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => approveInvoiceJob(id, userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] }),
  });
}

export function useRequeueInvoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => requeueInvoiceJob(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nfse", "jobs"] }),
  });
}

// --- Webhooks recebidos -----------------------------------------------------
export function useWebhookEvents(filters: WebhookFilters) {
  return useQuery({
    queryKey: nfseKeys.webhooks(filters),
    queryFn: () => fetchWebhookEvents(filters),
    refetchInterval: 15_000, // log de debug: atualiza sozinho
  });
}
