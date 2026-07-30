import { supabase, type Tables } from "@/lib/supabase";

export type BankAccount = Tables["bank_accounts"]["Row"];
export type BankAccountInsert = Tables["bank_accounts"]["Insert"];
export type BankAccountUpdate = Tables["bank_accounts"]["Update"];

export interface BankAccountWithBalance {
  company_id: string;
  company_name: string;
  bank_account_id: string;
  bank_name: string;
  nickname: string;
  account_type: string;
  initial_balance: number;
  inflow: number;
  outflow: number;
  closing_balance: number;
}

export interface LedgerEntry {
  transaction_id: string;
  cash_date: string;
  description: string;
  direction: "inflow" | "outflow";
  amount: number;
  signed_amount: number;
  account_code: string | null;
  account_name: string | null;
  counterparty_name: string | null;
  document_ref: string | null;
  running_balance: number;
}

export interface AccountPeriodSummary {
  opening_balance: number;
  inflow: number;
  outflow: number;
  closing_balance: number;
}

/**
 * Saldo das contas de várias empresas numa data. `companyIds` null busca todas
 * as empresas que o usuário acessa — é o modo consolidado.
 */
export async function fetchBalancesMulti(
  asOf: string,
  companyIds: string[] | null,
): Promise<BankAccountWithBalance[]> {
  const { data, error } = await supabase.rpc("bank_balances_multi", {
    p_as_of: asOf,
    // O default da RPC (todas as empresas acessíveis) é o parâmetro ausente.
    p_company_ids: companyIds ?? undefined,
  });
  if (error) throw error;
  return data ?? [];
}

/** Extrato de uma conta no período, com saldo corrente linha a linha. */
export async function fetchAccountLedger(
  bankAccountId: string,
  from: string,
  to: string,
): Promise<LedgerEntry[]> {
  const { data, error } = await supabase.rpc("bank_account_ledger", {
    p_bank_account_id: bankAccountId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

/** Abertura, entradas, saídas e fechamento de uma conta no período. */
export async function fetchAccountPeriod(
  bankAccountId: string,
  from: string,
  to: string,
): Promise<AccountPeriodSummary> {
  const { data, error } = await supabase
    .rpc("bank_account_period", {
      p_bank_account_id: bankAccountId,
      p_from: from,
      p_to: to,
    })
    .single();
  if (error) throw error;
  return data;
}

export async function fetchBankAccount(id: string): Promise<BankAccount> {
  const { data, error } = await supabase.from("bank_accounts").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

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
