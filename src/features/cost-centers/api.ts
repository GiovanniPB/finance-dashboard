import { supabase, type Tables } from "@/lib/supabase";

export type CostCenter = Tables["cost_centers"]["Row"];
export type CostCenterInsert = Tables["cost_centers"]["Insert"];
export type CostCenterUpdate = Tables["cost_centers"]["Update"];

export async function fetchCostCenters(companyId: string): Promise<CostCenter[]> {
  const { data, error } = await supabase
    .from("cost_centers")
    .select("*")
    .eq("company_id", companyId)
    .order("code", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCostCenter(payload: CostCenterInsert): Promise<CostCenter> {
  const { data, error } = await supabase.from("cost_centers").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCostCenter(id: string, payload: CostCenterUpdate): Promise<CostCenter> {
  const { data, error } = await supabase
    .from("cost_centers")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
