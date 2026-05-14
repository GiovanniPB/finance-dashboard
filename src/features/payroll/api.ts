import { supabase, type Enums, type Tables } from "@/lib/supabase";

export type PayrollRun = Tables["payroll_runs"]["Row"];
export type PayrollItem = Tables["payroll_items"]["Row"];
export type PayrollItemInsert = Tables["payroll_items"]["Insert"];
export type PayrollItemUpdate = Tables["payroll_items"]["Update"];
export type PayrollPaymentType = Enums["payroll_payment_type"];

export interface PayrollRunSummary extends PayrollRun {
  items_count: number;
  total_employer_cost: number;
}

export async function fetchPayrollRuns(companyId: string): Promise<PayrollRun[]> {
  const { data, error } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("company_id", companyId)
    .order("reference_month", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchPayrollRun(id: string): Promise<PayrollRun | null> {
  const { data, error } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface PayrollItemWithEmployee extends PayrollItem {
  employee: {
    id: string;
    full_name: string;
    role: string | null;
    cost_center_id: string | null;
  } | null;
}

export async function fetchPayrollItems(runId: string): Promise<PayrollItemWithEmployee[]> {
  const { data, error } = await supabase
    .from("payroll_items")
    .select(
      `*, employee:employees!payroll_items_employee_id_fkey(id, full_name, role, cost_center_id)`,
    )
    .eq("payroll_run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) satisfies PayrollItemWithEmployee[];
}

export async function createPayrollRun(companyId: string, referenceMonth: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_payroll_run_with_active_employees", {
    p_company_id: companyId,
    p_reference_month: referenceMonth,
  });
  if (error) throw error;
  return data;
}

export async function updatePayrollItem(
  id: string,
  payload: PayrollItemUpdate,
): Promise<PayrollItem> {
  const { data, error } = await supabase
    .from("payroll_items")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePayrollItem(id: string): Promise<void> {
  const { error } = await supabase.from("payroll_items").delete().eq("id", id);
  if (error) throw error;
}

export async function deletePayrollRun(runId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_payroll_run", { p_run_id: runId });
  if (error) throw error;
}

export async function postPayrollRun(
  runId: string,
  defaultAccountId: string,
): Promise<{ generatedCount: number; totalAmount: number }> {
  const { data, error } = await supabase.rpc("post_payroll_run", {
    p_run_id: runId,
    p_default_account_id: defaultAccountId,
  });
  if (error) throw error;
  const row = data?.[0];
  return {
    generatedCount: row?.generated_count ?? 0,
    totalAmount: row?.total_amount ?? 0,
  };
}
