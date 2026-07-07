import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type DataModule = "financials" | "payroll" | "taxes" | "nfse" | "audit";
const MODULES: DataModule[] = ["financials", "payroll", "taxes", "nfse", "audit"];

interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  role: "super_admin" | "admin" | "editor" | "viewer";
  company_ids: string[];
  /** null/omitido = enxerga todos os módulos; array = allow-list. */
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

/** Sanitiza a allow-list de módulos; retorna null (= todos) quando vazia/ausente. */
function normalizeModules(input: unknown): DataModule[] | null {
  if (!Array.isArray(input)) return null;
  const filtered = input.filter((m): m is DataModule => MODULES.includes(m as DataModule));
  return filtered.length > 0 ? Array.from(new Set(filtered)) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Caller identity: use anon key + caller's JWT to identify them, then check role from profiles.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: callerUser, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !callerUser?.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Use the same RLS-aware client to validate super_admin (RLS on profiles allows self-read).
  const { data: profile, error: profErr } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", callerUser.user.id)
    .maybeSingle();
  if (profErr || profile?.role !== "super_admin") {
    return json({ error: "Forbidden: super_admin only" }, 403);
  }

  let payload: CreateUserPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { email, password, full_name, role, company_ids } = payload;
  if (!email || !password || !full_name || !role || !Array.isArray(company_ids)) {
    return json({ error: "Missing fields" }, 400);
  }
  if (!["super_admin", "admin", "editor", "viewer"].includes(role)) {
    return json({ error: "Invalid role" }, 400);
  }
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 chars" }, 400);
  }
  const visibleModules = normalizeModules(payload.visible_modules);

  // Admin client (service_role) for the actual mutations.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Create the auth user (email pre-confirmed so they can login right away).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });
  if (createErr || !created.user) {
    return json({ error: createErr?.message ?? "Failed to create user" }, 400);
  }
  const newUserId = created.user.id;

  // 2) The handle_new_user trigger inserts a profiles row; update its role+name+modules.
  const { error: profileUpdateErr } = await admin
    .from("profiles")
    .update({ full_name, role, visible_modules: visibleModules })
    .eq("id", newUserId);
  if (profileUpdateErr) {
    return json(
      { error: `User created but profile update failed: ${profileUpdateErr.message}` },
      500,
    );
  }

  // 3) Insert company_access rows (super_admins don't need them but we accept any list anyway).
  if (company_ids.length > 0) {
    const rows = company_ids.map((company_id) => ({
      user_id: newUserId,
      company_id,
      created_by: callerUser.user.id,
    }));
    const { error: accessErr } = await admin.from("company_access").insert(rows);
    if (accessErr) {
      return json({ error: `User created but company access failed: ${accessErr.message}` }, 500);
    }
  }

  return json({ user_id: newUserId, email });
});
