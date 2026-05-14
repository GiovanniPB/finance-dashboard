import { supabase, type Enums, type Tables } from "@/lib/supabase";

export type TaxObligation = Tables["tax_obligations"]["Row"];
export type TaxObligationKind = Enums["tax_obligation_kind"];
export type TaxObligationStatus = Enums["tax_obligation_status"];

export interface ListFilters {
  companyId: string;
  status?: TaxObligationStatus[];
  from?: string;
  to?: string;
}

export async function fetchTaxObligations(filters: ListFilters): Promise<TaxObligation[]> {
  let query = supabase.from("tax_obligations").select("*").eq("company_id", filters.companyId);
  if (filters.status && filters.status.length > 0) query = query.in("status", filters.status);
  if (filters.from) query = query.gte("due_date", filters.from);
  if (filters.to) query = query.lte("due_date", filters.to);
  query = query.order("due_date", { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function generateTaxObligations(
  companyId: string,
  referencePeriod: string,
): Promise<TaxObligation[]> {
  const { data, error } = await supabase.rpc("generate_tax_obligations", {
    p_company_id: companyId,
    p_reference_period: referencePeriod,
  });
  if (error) throw error;
  return data ?? [];
}

export interface MarkPaidInput {
  obligationId: string;
  paidAt: string;
  bankAccountId: string;
  accountId: string;
  actualAmount: number | null;
}

export async function markTaxPaid(input: MarkPaidInput): Promise<TaxObligation> {
  const { data, error } = await supabase.rpc("mark_tax_paid", {
    p_obligation_id: input.obligationId,
    p_paid_at: input.paidAt,
    p_bank_account_id: input.bankAccountId,
    p_account_id: input.accountId,
    p_actual_amount: input.actualAmount ?? undefined,
  });
  if (error) throw error;
  return data;
}

export async function updateTaxObligation(
  id: string,
  payload: Partial<Tables["tax_obligations"]["Update"]>,
): Promise<TaxObligation> {
  const { data, error } = await supabase
    .from("tax_obligations")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTaxObligation(id: string): Promise<void> {
  const { error } = await supabase.from("tax_obligations").delete().eq("id", id);
  if (error) throw error;
}

export async function markOverdueObligations(companyId: string): Promise<number> {
  const { data, error } = await supabase.rpc("mark_overdue_obligations", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return data ?? 0;
}
