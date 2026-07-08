import { supabase, type Tables } from "@/lib/supabase";

export type Profile = Tables["profiles"]["Row"];

export interface UserWithAccess extends Profile {
  company_ids: string[];
}

export async function fetchUsers(): Promise<UserWithAccess[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true });
  if (error) throw error;

  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const { data: access, error: accessErr } = await supabase
    .from("company_access")
    .select("user_id, company_id")
    .in("user_id", ids);
  if (accessErr) throw accessErr;

  const byUser = new Map<string, string[]>();
  for (const row of access ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row.company_id);
    byUser.set(row.user_id, list);
  }

  return (profiles ?? []).map((p) => ({
    ...p,
    company_ids: byUser.get(p.id) ?? [],
  }));
}

export interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  role: "super_admin" | "admin" | "editor" | "viewer";
  company_ids: string[];
  /** null/omitido = todos os módulos; array = allow-list. */
  visible_modules?: string[] | null;
}

export async function createUser(input: CreateUserInput): Promise<{ user_id: string }> {
  const result = await supabase.functions.invoke<{ user_id: string; error?: string }>(
    "admin-create-user",
    { body: input },
  );
  if (result.error) throw result.error;
  const data = result.data;
  if (data?.error) throw new Error(data.error);
  if (!data?.user_id) throw new Error("Resposta inválida do servidor");
  return { user_id: data.user_id };
}

export interface UpdateUserInput {
  user_id: string;
  full_name?: string;
  role?: "super_admin" | "admin" | "editor" | "viewer";
  company_ids?: string[];
  new_password?: string;
  /** null = todos os módulos; array = allow-list. */
  visible_modules?: string[] | null;
}

export async function updateUser(input: UpdateUserInput): Promise<void> {
  const result = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    "admin-update-user",
    { body: input },
  );
  if (result.error) throw result.error;
  if (result.data?.error) throw new Error(result.data.error);
}
