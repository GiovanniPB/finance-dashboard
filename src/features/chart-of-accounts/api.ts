import { supabase, type Tables } from "@/lib/supabase";

export type ChartAccount = Tables["chart_of_accounts"]["Row"];
export type ChartAccountInsert = Tables["chart_of_accounts"]["Insert"];
export type ChartAccountUpdate = Tables["chart_of_accounts"]["Update"];

export async function fetchChartAccounts(companyId: string): Promise<ChartAccount[]> {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createChartAccount(payload: ChartAccountInsert): Promise<ChartAccount> {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChartAccount(
  id: string,
  payload: ChartAccountUpdate,
): Promise<ChartAccount> {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChartAccount(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_chart_account", { p_account_id: id });
  if (error) throw error;
}
