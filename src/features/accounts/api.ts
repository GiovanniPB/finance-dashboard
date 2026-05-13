import { supabase, type Tables } from "@/lib/supabase";

export type ChartAccount = Tables["chart_of_accounts"]["Row"];

export async function fetchAccountsByCompany(companyId: string): Promise<ChartAccount[]> {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .eq("is_summary", false)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
