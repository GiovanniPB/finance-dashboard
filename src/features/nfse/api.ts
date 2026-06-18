import { supabase, type Enums, type Tables } from "@/lib/supabase";

/** Bucket de Storage dos XML/DANFSe (criado junto com a focus-webhook, Fase 5). */
const NFSE_FILES_BUCKET = "nfse-files";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type NfseAmbiente = Enums["nfse_ambiente"];
export type NfseEmissionMode = Enums["nfse_emission_mode"];

interface CompanyRef {
  id: string;
  legal_name: string;
  trade_name: string | null;
}

export type PagarmeAccountRow = Tables["pagarme_accounts"]["Row"];
export type PagarmeAccount = PagarmeAccountRow & { owner: CompanyRef | null };

export type RecipientRow = Tables["pagarme_recipient_map"]["Row"];
export type Recipient = RecipientRow & { company: CompanyRef | null };

export type FiscalSettings = Tables["fiscal_company_settings"]["Row"];

export type InvoiceJobStatus = Enums["invoice_job_status"];
export type InvoiceJobRow = Tables["invoice_jobs"]["Row"];
export type InvoiceJob = InvoiceJobRow & {
  company: CompanyRef | null;
  account: { id: string; label: string; slug: string } | null;
};

export interface InvoiceJobFilters {
  statuses: string[] | null; // null = todas
  accountId?: string | null;
}

export type WebhookProvider = "pagarme" | "focus";

/** Evento de webhook normalizado (sales_events ou focus_events) para o log de debug. */
export interface WebhookEvent {
  id: string;
  provider: WebhookProvider;
  ref: string; // event_id (pagar.me) | focus_ref (Focus)
  kind: string; // event_type (pagar.me) | status (Focus)
  resourceId: string | null;
  receivedAt: string;
  processedAt: string | null;
  processError: string | null;
  payload: unknown;
}

export interface WebhookFilters {
  provider: WebhookProvider;
  onlyErrors: boolean;
  onlyUnprocessed: boolean;
}

// ---------------------------------------------------------------------------
// Conexões pagar.me (pagarme_accounts)
// ---------------------------------------------------------------------------
export async function fetchConnections(): Promise<PagarmeAccount[]> {
  const { data, error } = await supabase
    .from("pagarme_accounts")
    .select("*, owner:companies!owner_company_id(id, legal_name, trade_name)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createConnection(
  payload: Tables["pagarme_accounts"]["Insert"],
): Promise<PagarmeAccountRow> {
  const { data, error } = await supabase
    .from("pagarme_accounts")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateConnection(
  id: string,
  payload: Tables["pagarme_accounts"]["Update"],
): Promise<PagarmeAccountRow> {
  const { data, error } = await supabase
    .from("pagarme_accounts")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Recebedores do split (pagarme_recipient_map) — escopados por conta
// ---------------------------------------------------------------------------
export async function fetchRecipients(accountId: string): Promise<Recipient[]> {
  const { data, error } = await supabase
    .from("pagarme_recipient_map")
    .select("*, company:companies!company_id(id, legal_name, trade_name)")
    .eq("pagarme_account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createRecipient(
  payload: Tables["pagarme_recipient_map"]["Insert"],
): Promise<RecipientRow> {
  const { data, error } = await supabase
    .from("pagarme_recipient_map")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRecipient(
  id: string,
  payload: Tables["pagarme_recipient_map"]["Update"],
): Promise<RecipientRow> {
  const { data, error } = await supabase
    .from("pagarme_recipient_map")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRecipient(id: string): Promise<void> {
  const { error } = await supabase.from("pagarme_recipient_map").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Configuração fiscal por empresa (fiscal_company_settings)
// ---------------------------------------------------------------------------
export async function fetchFiscalSettings(): Promise<FiscalSettings[]> {
  const { data, error } = await supabase.from("fiscal_company_settings").select("*");
  if (error) throw error;
  return data ?? [];
}

/** Upsert por company_id (1:1). Retorna a linha persistida. */
export async function upsertFiscalSettings(
  payload: Tables["fiscal_company_settings"]["Insert"],
): Promise<FiscalSettings> {
  const { data, error } = await supabase
    .from("fiscal_company_settings")
    .upsert(payload, { onConflict: "company_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Segredos (via RPC SECURITY DEFINER — o valor vai direto ao Vault)
// ---------------------------------------------------------------------------
/** Gera um novo segredo de webhook para a conta e o retorna UMA vez (para a URL). */
export async function rotateWebhookSecret(accountId: string): Promise<string> {
  const { data, error } = await supabase.rpc("rotate_account_webhook_secret", {
    p_account_id: accountId,
  });
  if (error) throw error;
  return data;
}

/** Salva o token do Focus de uma empresa no Vault (não retorna o valor). */
export async function setFocusToken(companyId: string, token: string): Promise<void> {
  const { error } = await supabase.rpc("set_company_focus_token", {
    p_company_id: companyId,
    p_token: token,
  });
  if (error) throw error;
}

/** Salva a secret key da API do pagar.me de uma conta no Vault (split via /payables). */
export async function setPagarmeAccountSecret(accountId: string, secret: string): Promise<void> {
  const { error } = await supabase.rpc("set_pagarme_account_secret", {
    p_account_id: accountId,
    p_secret: secret,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Fila de notas (invoice_jobs)
// ---------------------------------------------------------------------------
const JOB_LIST_LIMIT = 300;

export async function fetchInvoiceJobs(filters: InvoiceJobFilters): Promise<InvoiceJob[]> {
  let query = supabase
    .from("invoice_jobs")
    .select(
      "*, company:companies!company_id(id, legal_name, trade_name), account:pagarme_accounts!pagarme_account_id(id, label, slug)",
    )
    .order("created_at", { ascending: false })
    .limit(JOB_LIST_LIMIT);

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in("status", filters.statuses as InvoiceJobStatus[]);
  }
  if (filters.accountId) {
    query = query.eq("pagarme_account_id", filters.accountId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Aprova um job em revisão manual: vai para a fila de emissão. */
export async function approveInvoiceJob(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("invoice_jobs")
    .update({ status: "queued", approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_review");
  if (error) throw error;
}

/** Recoloca um job com erro (rejected/failed) na fila, zerando as tentativas. */
export async function requeueInvoiceJob(id: string): Promise<void> {
  const { error } = await supabase
    .from("invoice_jobs")
    .update({ status: "queued", attempts: 0, next_attempt_at: null })
    .eq("id", id)
    .in("status", ["rejected", "failed"]);
  if (error) throw error;
}

/** URL assinada para baixar um arquivo (XML/DANFSe) do Storage. */
export async function nfseFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(NFSE_FILES_BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Webhooks recebidos (log de debug — sales_events / focus_events)
// Tabelas restritas a super admin via RLS.
// ---------------------------------------------------------------------------
const WEBHOOK_LIST_LIMIT = 200;

export async function fetchWebhookEvents(filters: WebhookFilters): Promise<WebhookEvent[]> {
  const table = filters.provider === "pagarme" ? "sales_events" : "focus_events";
  let query = supabase
    .from(table)
    .select("*")
    .order("received_at", { ascending: false })
    .limit(WEBHOOK_LIST_LIMIT);

  if (filters.onlyErrors) query = query.not("process_error", "is", null);
  if (filters.onlyUnprocessed) query = query.is("processed_at", null);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const isPagarme = filters.provider === "pagarme";
    return {
      id: r.id as string,
      provider: filters.provider,
      ref: (isPagarme ? r.event_id : r.focus_ref) as string,
      kind: ((isPagarme ? r.event_type : r.status) as string | null) ?? "—",
      resourceId: isPagarme ? ((r.resource_id as string | null) ?? null) : null,
      receivedAt: r.received_at as string,
      processedAt: (r.processed_at as string | null) ?? null,
      processError: (r.process_error as string | null) ?? null,
      payload: r.payload,
    };
  });
}
