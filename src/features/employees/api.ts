import { supabase, type Tables } from "@/lib/supabase";

export type Employee = Tables["employees"]["Row"];
export type EmployeeInsert = Tables["employees"]["Insert"];
export type EmployeeUpdate = Tables["employees"]["Update"];

export interface EmployeeFilters {
  companyId: string;
  status?: "active" | "on_leave" | "terminated" | null;
  search?: string | null;
}

export async function fetchEmployees(filters: EmployeeFilters): Promise<Employee[]> {
  let query = supabase
    .from("employees")
    .select("*")
    .eq("company_id", filters.companyId)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search && filters.search.trim() !== "") {
    query = query.ilike("full_name", `%${filters.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createEmployee(payload: EmployeeInsert): Promise<Employee> {
  const { data, error } = await supabase.from("employees").insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateEmployee(id: string, payload: EmployeeUpdate): Promise<Employee> {
  const { data, error } = await supabase
    .from("employees")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_employee", { p_employee_id: id });
  if (error) throw error;
}
