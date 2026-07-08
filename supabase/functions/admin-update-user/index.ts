import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type DataModule = "financials" | "payroll" | "taxes" | "nfse" | "audit";
const MODULES: DataModule[] = ["financials", "payroll", "taxes", "nfse", "audit"];

interface UpdateUserPayload {
  user_id: string;
  full_name?: string;
  role?: "super_admin" | "admin" | "editor" | "viewer";
  company_ids?: string[];
  new_password?: string;
  /** undefined = não mexe; null = todos os módulos; array = allow-list. */
  visible_modules?: DataModule[] | null;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Sanitiza a allow-list; retorna null (= todos) quando vazia. */
function normalizeModules(input: DataModule[] | null): DataModule[] | null {
  if (!Array.isArray(input)) return null;
  const filtered = input.filter((m): m is DataModule => MODULES.includes(m));
  return filtered.length > 0 ? Array.from(new Set(filtered)) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey)
    return json({ error: "Server misconfigured" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: callerUser, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !callerUser?.user) return json({ error: "Unauthorized" }, 401);

  const { data: profile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", callerUser.user.id)
    .maybeSingle();
  if (profile?.role !== "super_admin") return json({ error: "Forbidden" }, 403);

  let payload: UpdateUserPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { user_id, full_name, role, company_ids, new_password } = payload;
  if (!user_id) return json({ error: "Missing user_id" }, 400);
  if (role && !["super_admin", "admin", "editor", "viewer"].includes(role))
    return json({ error: "Invalid role" }, 400);
  if (new_password && new_password.length < 8) return json({ error: "Password too short" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Update profile (name + role + visible_modules). visible_modules ausente = não mexe.
  const profileUpdate: Record<string, unknown> = {};
  if (full_name !== undefined) profileUpdate.full_name = full_name;
  if (role !== undefined) profileUpdate.role = role;
  if (payload.visible_modules !== undefined) {
    profileUpdate.visible_modules = normalizeModules(payload.visible_modules);
  }
  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await admin.from("profiles").update(profileUpdate).eq("id", user_id);
    if (error) return json({ error: error.message }, 500);
  }

  // Reset password
  if (new_password) {
    const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
    if (error) return json({ error: error.message }, 500);
  }

  // Sync company_access: delete then re-insert
  if (company_ids !== undefined) {
    const { error: delErr } = await admin.from("company_access").delete().eq("user_id", user_id);
    if (delErr) return json({ error: delErr.message }, 500);
    if (company_ids.length > 0) {
      const rows = company_ids.map((company_id) => ({
        user_id,
        company_id,
        created_by: callerUser.user.id,
      }));
      const { error: insErr } = await admin.from("company_access").insert(rows);
      if (insErr) return json({ error: insErr.message }, 500);
    }
  }

  return json({ user_id, ok: true });
});
