import { supabase, type Tables } from "@/lib/supabase";

export type BankAccount = Tables["bank_accounts"]["Row"];
export type BankAccountInsert = Tables["bank_accounts"]["Insert"];
export type BankAccountUpdate = Tables["bank_accounts"]["Update"];

export async function fetchBankAccounts(companyId: string): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createBankAccount(payload: BankAccountInsert): Promise<BankAccount> {
  const { data, error } = await supabase.from("bank_accounts").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateBankAccount(
  id: string,
  payload: BankAccountUpdate,
): Promise<BankAccount> {
  const { data, error } = await supabase
    .from("bank_accounts")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleBankAccountActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("bank_accounts")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

export interface BankAccountUsage {
  transactions: number;
  statementLines: number;
  recurringTemplates: number;
  snapshots: number;
}

/** Count records that reference this bank account, to warn before deletion. */
export async function fetchBankAccountUsage(id: string): Promise<BankAccountUsage> {
  const { data, error } = await supabase.rpc("bank_account_usage", { p_id: id }).single();
  if (error) throw error;
  return {
    transactions: data.transactions,
    statementLines: data.statement_lines,
    recurringTemplates: data.recurring_templates,
    snapshots: data.snapshots,
  };
}

/**
 * Delete a bank account. Cascade-deletes its statement lines and balance
 * snapshots; transactions and recurring templates keep their history with the
 * bank account reference set to null (enforced by FK ON DELETE rules).
 */
export async function deleteBankAccount(id: string): Promise<void> {
  const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
  if (error) throw error;
}
