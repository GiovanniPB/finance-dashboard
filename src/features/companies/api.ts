import { supabase, type Tables } from "@/lib/supabase";

export type Company = Tables["companies"]["Row"];

export async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
