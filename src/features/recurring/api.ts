import { supabase, type Enums, type Tables } from "@/lib/supabase";

export type RecurringTemplate = Tables["recurring_templates"]["Row"];
export type RecurringTemplateInsert = Tables["recurring_templates"]["Insert"];
export type RecurringTemplateUpdate = Tables["recurring_templates"]["Update"];
export type RecurrenceFrequency = Enums["recurrence_frequency"];

export interface RecurringTemplateWithJoins extends RecurringTemplate {
  account: { id: string; code: string; name: string } | null;
  company: { id: string; trade_name: string | null; legal_name: string } | null;
}

export async function fetchRecurringTemplates(
  companyId: string | null,
): Promise<RecurringTemplateWithJoins[]> {
  let query = supabase
    .from("recurring_templates")
    .select(
      `*,
       account:chart_of_accounts!recurring_templates_account_id_fkey(id, code, name),
       company:companies!recurring_templates_company_id_fkey(id, trade_name, legal_name)`,
    )
    .order("next_run_date", { ascending: true });

  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) satisfies RecurringTemplateWithJoins[];
}

export interface CreateRecurringResult {
  template: RecurringTemplate;
  backfilledCount: number;
}

export async function createRecurringTemplate(
  payload: RecurringTemplateInsert,
): Promise<CreateRecurringResult> {
  const { data, error } = await supabase
    .from("recurring_templates")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  // Auto-backfill occurrences from start_date up to today (covers retroactive templates).
  const { data: count, error: backfillError } = await supabase.rpc("backfill_recurring_template", {
    p_template_id: data.id,
  });
  if (backfillError) throw backfillError;

  return { template: data, backfilledCount: count ?? 0 };
}

export async function updateRecurringTemplate(
  id: string,
  payload: RecurringTemplateUpdate,
): Promise<RecurringTemplate> {
  const { data, error } = await supabase
    .from("recurring_templates")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRecurringTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("recurring_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function approveRecurringTemplate(templateId: string): Promise<string> {
  const { data, error } = await supabase.rpc("approve_recurring_template", {
    p_template_id: templateId,
  });
  if (error) throw error;
  return data;
}

export async function generateRecurringTransactions(
  throughDate?: string,
): Promise<{ template_id: string; generated_count: number }[]> {
  const { data, error } = await supabase.rpc(
    "generate_recurring_transactions",
    throughDate ? { p_through_date: throughDate } : {},
  );
  if (error) throw error;
  return data ?? [];
}
