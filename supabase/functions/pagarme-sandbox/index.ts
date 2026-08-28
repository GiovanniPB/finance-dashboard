/**
 * Edge Function: pagarme-sandbox
 *
 * Gera COBRANÇAS DE TESTE no ambiente sandbox do pagar.me (`POST /orders`) a
 * partir da UI, para validar a esteira NFS-e/NF-e ponta a ponta. A cobrança é
 * real no sandbox (não há dinheiro), auto-liquida (cartão na hora; pix em
 * segundos; boleto concilia pelo CEP) e o `charge.paid` chega no nosso
 * `pagarme-webhook` pelo caminho normal → vira invoice_jobs.
 *
 * Wrapper fino: o builder do payload é PURO (`_shared/nfse/sandbox.ts`, testado
 * por Vitest); aqui só fazem-se autorização, leitura do segredo e o HTTP.
 *
 * Segurança (trava dupla — esta função NUNCA cria cobrança de produção):
 *   1) só super admin autenticado (verify_jwt=true + RPC is_super_admin);
 *   2) recusa se a conta não for `ambiente='homologacao'`;
 *   3) recusa se a chave do Vault não começar com `sk_test_`.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import { buildSandboxOrder, type SandboxOrderInput } from "../_shared/nfse/sandbox.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const PAGARME_BASE = "https://api.pagar.me/core/v5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

/** Confirma que o chamador é um super admin autenticado (usa o JWT do request). */
async function authorizeSuperAdmin(authHeader: string): Promise<boolean> {
  if (!authHeader) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return false;
  const { data, error } = await userClient.rpc("is_super_admin");
  return !error && data === true;
}

interface SandboxRequest extends SandboxOrderInput {
  accountId: string;
}

/** Resume a resposta do pagar.me para o que a UI precisa (sem dado sensível). */
function summarizeOrder(order: Record<string, unknown>): Record<string, unknown> {
  const charges = Array.isArray(order.charges) ? order.charges : [];
  return {
    orderId: order.id ?? null,
    code: order.code ?? null,
    status: order.status ?? null,
    charges: charges.map((c) => {
      const charge = (c ?? {}) as Record<string, unknown>;
      const tx = (charge.last_transaction ?? {}) as Record<string, unknown>;
      return {
        id: charge.id ?? null,
        status: charge.status ?? null,
        paymentMethod: charge.payment_method ?? null,
        // úteis para o operador conferir o pagamento de teste:
        qrCode: tx.qr_code ?? null,
        qrCodeUrl: tx.qr_code_url ?? null,
        boletoUrl: tx.url ?? null,
        boletoLine: tx.line ?? null,
      };
    }),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1) autorização: super admin autenticado
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!(await authorizeSuperAdmin(authHeader))) {
    return json({ error: "forbidden" }, 403);
  }

  let body: SandboxRequest;
  try {
    body = (await req.json()) as SandboxRequest;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.accountId) return json({ error: "missing_account_id" }, 400);

  const svc: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 2) conta tem que existir, estar ativa e ser de HOMOLOGAÇÃO
  const { data: account } = await svc
    .from("pagarme_accounts")
    .select("id, slug, ambiente, active")
    .eq("id", body.accountId)
    .maybeSingle();
  if (!account || account.active !== true) return json({ error: "unknown_account" }, 404);
  if (account.ambiente !== "homologacao") {
    return json({ error: "sandbox_only_homologacao", ambiente: account.ambiente }, 403);
  }

  // 3) chave do Vault tem que ser de TESTE (sk_test_)
  const { data: apiKey } = await svc.rpc("get_pagarme_account_secret", {
    p_account_id: account.id,
  });
  if (typeof apiKey !== "string" || !apiKey.startsWith("sk_test_")) {
    return json({ error: "missing_or_non_test_key" }, 422);
  }

  // 4) monta (puro) e valida o payload
  const { payload, errors } = buildSandboxOrder({
    method: body.method,
    scenario: body.scenario,
    amountCents: body.amountCents,
    description: body.description ?? null,
    customer: body.customer,
    split: body.split,
  });
  if (errors.length > 0) return json({ error: "invalid_input", details: errors }, 422);

  // 5) cria a cobrança de teste no sandbox
  let res: Response;
  try {
    res = await fetch(`${PAGARME_BASE}/orders`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${apiKey}:`),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return json({ error: "pagarme_unreachable", detail: String(err) }, 502);
  }

  const order = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return json({ error: "pagarme_error", status: res.status, detail: order }, 502);
  }

  return json({ status: "created", order: summarizeOrder(order) });
});
