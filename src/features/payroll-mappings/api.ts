import { supabase, type Enums, type Tables } from "@/lib/supabase";

export type PayrollMapping = Tables["payroll_account_mappings"]["Row"];
export type PayrollMappingInsert = Tables["payroll_account_mappings"]["Insert"];
export type PayrollMappingUpdate = Tables["payroll_account_mappings"]["Update"];
export type PayrollComponent = Enums["payroll_component"];
export type EmployeeKind = Enums["employee_kind"];

export interface PayrollMappingWithAccount extends PayrollMapping {
  account: { id: string; code: string; name: string } | null;
  cost_center: { id: string; code: string; name: string } | null;
}

export async function fetchPayrollMappings(
  companyId: string,
): Promise<PayrollMappingWithAccount[]> {
  const { data, error } = await supabase
    .from("payroll_account_mappings")
    .select(
      `*,
       account:chart_of_accounts!payroll_account_mappings_account_id_fkey(id, code, name),
       cost_center:cost_centers!payroll_account_mappings_cost_center_id_fkey(id, code, name)`,
    )
    .eq("company_id", companyId)
    .order("employee_kind")
    .order("component");
  if (error) throw error;
  return data ?? [];
}

export async function setupPayrollMappingsDefaults(companyId: string): Promise<PayrollMapping[]> {
  const { data, error } = await supabase.rpc("setup_payroll_mappings_defaults", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function upsertPayrollMapping(payload: PayrollMappingInsert): Promise<PayrollMapping> {
  const { data, error } = await supabase
    .from("payroll_account_mappings")
    .upsert(payload, { onConflict: "company_id,employee_kind,component" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePayrollMapping(id: string): Promise<void> {
  const { error } = await supabase.from("payroll_account_mappings").delete().eq("id", id);
  if (error) throw error;
}

export interface PreviewRow {
  employee_name: string;
  employee_kind: EmployeeKind;
  component: PayrollComponent;
  amount: number;
  account_code: string | null;
  account_name: string | null;
  has_mapping: boolean;
}

export async function previewPayrollPosting(runId: string): Promise<PreviewRow[]> {
  const { data, error } = await supabase.rpc("preview_payroll_posting", { p_run_id: runId });
  if (error) throw error;
  return data ?? [];
}
