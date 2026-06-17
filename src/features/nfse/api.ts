import { supabase, type Enums, type Tables } from "@/lib/supabase";

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
