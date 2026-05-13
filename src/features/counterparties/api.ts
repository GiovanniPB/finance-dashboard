import { supabase, type Tables } from "@/lib/supabase";

export type Counterparty = Tables["counterparties"]["Row"];
export type CounterpartyInsert = Tables["counterparties"]["Insert"];
export type CounterpartyUpdate = Tables["counterparties"]["Update"];

export type CounterpartyKind =
  | "customer"
  | "supplier"
  | "employee"
  | "partner"
  | "government"
  | "other";

export interface CounterpartyFilters {
  organizationId: string;
  kind?: CounterpartyKind | null;
  search?: string | null;
}

export async function fetchCounterparties(filters: CounterpartyFilters): Promise<Counterparty[]> {
  let query = supabase
    .from("counterparties")
    .select("*")
    .eq("organization_id", filters.organizationId)
    .order("name", { ascending: true });

  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.search && filters.search.trim() !== "") {
    query = query.ilike("name", `%${filters.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createCounterparty(payload: CounterpartyInsert): Promise<Counterparty> {
  const { data, error } = await supabase.from("counterparties").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCounterparty(
  id: string,
  payload: CounterpartyUpdate,
): Promise<Counterparty> {
  const { data, error } = await supabase
    .from("counterparties")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
