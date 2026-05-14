import { supabase, type Enums, type Tables } from "@/lib/supabase";

import type { OfxTransaction } from "./ofxParser";

export type StatementLine = Tables["bank_statement_lines"]["Row"];
export type StatementLineInsert = Tables["bank_statement_lines"]["Insert"];
export type StatementLineStatus = Enums["statement_line_status"];

export interface StatementLineWithRelations extends StatementLine {
  bank_account: { id: string; nickname: string; bank_name: string } | null;
  matched_transaction: {
    id: string;
    description: string;
    amount: number;
    direction: Enums["transaction_direction"];
  } | null;
}

export interface ListFilters {
  companyId: string;
  bankAccountId?: string | null;
  status?: StatementLineStatus[];
  from?: string | null;
  to?: string | null;
}

const SELECT_WITH_RELATIONS = `
  *,
  bank_account:bank_accounts!bank_statement_lines_bank_account_id_fkey(id, nickname, bank_name),
  matched_transaction:transactions!bank_statement_lines_matched_transaction_id_fkey(id, description, amount, direction)
` as const;

export async function fetchStatementLines(
  filters: ListFilters,
): Promise<StatementLineWithRelations[]> {
  let query = supabase
    .from("bank_statement_lines")
    .select(SELECT_WITH_RELATIONS)
    .eq("company_id", filters.companyId);

  if (filters.bankAccountId) query = query.eq("bank_account_id", filters.bankAccountId);
  if (filters.status && filters.status.length > 0) query = query.in("status", filters.status);
  if (filters.from) query = query.gte("posted_at", filters.from);
  if (filters.to) query = query.lte("posted_at", filters.to);

  query = query.order("posted_at", { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface ImportOfxInput {
  companyId: string;
  bankAccountId: string;
  fileName: string;
  transactions: OfxTransaction[];
}

export interface ImportOfxResult {
  inserted: number;
  duplicates: number;
}

export async function importOfxLines(input: ImportOfxInput): Promise<ImportOfxResult> {
  if (input.transactions.length === 0) {
    return { inserted: 0, duplicates: 0 };
  }

  const payload: StatementLineInsert[] = input.transactions.map((t) => ({
    company_id: input.companyId,
    bank_account_id: input.bankAccountId,
    posted_at: t.postedAt,
    amount: t.amount,
    description: t.description,
    fit_id: t.fitId,
    document_ref: t.documentRef,
    raw: t.raw,
    import_source: "ofx",
  }));

  // We rely on the unique index (bank_account_id, fit_id) for dedup. Postgres
  // returns the inserted rows; collect counts.
  const { data, error } = await supabase
    .from("bank_statement_lines")
    .upsert(payload, {
      onConflict: "bank_account_id,fit_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) throw error;
  const inserted = data?.length ?? 0;
  return {
    inserted,
    duplicates: input.transactions.length - inserted,
  };
}

export interface MatchCandidate {
  transaction_id: string;
  score: number;
  amount: number;
  direction: Enums["transaction_direction"];
  due_date: string | null;
  cash_date: string | null;
  accrual_date: string;
  description: string;
  counterparty_name: string | null;
  account_code: string | null;
  account_name: string | null;
}

export async function suggestCandidates(lineId: string, max = 10): Promise<MatchCandidate[]> {
  const { data, error } = await supabase.rpc("suggest_match_candidates", {
    p_line_id: lineId,
    p_max: max,
  });
  if (error) throw error;
  return data ?? [];
}

export async function matchStatementLine(
  lineId: string,
  transactionId: string,
): Promise<StatementLine> {
  const { data, error } = await supabase.rpc("match_statement_line", {
    p_line_id: lineId,
    p_transaction_id: transactionId,
  });
  if (error) throw error;
  return data;
}

export async function unmatchStatementLine(lineId: string): Promise<StatementLine> {
  const { data, error } = await supabase.rpc("unmatch_statement_line", { p_line_id: lineId });
  if (error) throw error;
  return data;
}

export async function ignoreStatementLine(lineId: string): Promise<StatementLine> {
  const { data, error } = await supabase.rpc("ignore_statement_line", { p_line_id: lineId });
  if (error) throw error;
  return data;
}

export async function deleteStatementLine(lineId: string): Promise<void> {
  const { error } = await supabase.from("bank_statement_lines").delete().eq("id", lineId);
  if (error) throw error;
}
