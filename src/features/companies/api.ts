import { supabase, type Tables } from "@/lib/supabase";

export type Company = Tables["companies"]["Row"];
export type CompanyInsert = Tables["companies"]["Insert"];
export type CompanyUpdate = Tables["companies"]["Update"];

export interface CompanyStatsRow {
  company_id: string;
  tx_count: number;
  tx_count_ytd: number;
  revenue_ytd: number;
  expense_ytd: number;
  last_activity: string | null;
  bank_account_count: number;
  employee_count_active: number;
}

export async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchAllCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchCompanyStats(): Promise<CompanyStatsRow[]> {
  const { data, error } = await supabase.rpc("company_stats");
  if (error) throw error;
  return data ?? [];
}

export async function createCompany(payload: CompanyInsert): Promise<Company> {
  const { data, error } = await supabase.from("companies").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCompany(id: string, payload: CompanyUpdate): Promise<Company> {
  const { data, error } = await supabase
    .from("companies")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
