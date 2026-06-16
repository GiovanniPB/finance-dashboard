/**
 * Edge Function: pagarme-webhook
 *
 * Recebe webhooks de UMA conta pagar.me (endereçada por `?account=<slug>`),
 * grava o evento bruto (idempotente) em `sales_events` e, para `charge.paid`,
 * explode em `invoice_jobs`:
 *   - COM split -> uma NFS-e por empresa-recebedor mapeado na conta;
 *   - SEM split -> uma NFS-e da empresa dona da conta (owner_company).
 * Wrapper fino: a lógica pura vive em `_shared/nfse` (testada por Vitest).
 *
 * Origem: cada conta tem segredo de webhook PRÓPRIO no Vault, lido via RPC
 * `get_pagarme_webhook_secret(slug)` (service_role). Sem conta/segredo -> rejeita.
 *
 * Idempotência:
 *   - `sales_events` (provider, event_id) único -> evento repetido é ignorado;
 *   - `invoice_jobs` (charge, recipient) único -> upsert ignoreDuplicates.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { parseChargePaidWebhook } from "../_shared/nfse/parse.ts";
import { explodeChargePaid } from "../_shared/nfse/split.ts";
import type {
  ExplodeContext,
  FiscalCompanySettings,
  InvoiceJobDraft,
  NfseAmbiente,
  NfseEmissionMode,
  PagarmeAccount,
  RecipientMapEntry,
  ServiceCatalogEntry,
} from "../_shared/nfse/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Resolve a conta pagar.me pelo slug (?account=). Retorna null se inexistente/inativa. */
async function loadAccount(supabase: SupabaseClient, slug: string): Promise<PagarmeAccount | null> {
  const { data } = await supabase
    .from("pagarme_accounts")
    .select("id, slug, owner_company_id, organization_id, ambiente, active")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    slug: data.slug as string,
    ownerCompanyId: data.owner_company_id as string,
    organizationId: data.organization_id as string,
    ambiente: data.ambiente as NfseAmbiente,
  };
}

async function loadContext(
  supabase: SupabaseClient,
  account: PagarmeAccount,
  recipientIds: string[],
): Promise<ExplodeContext> {
  // recebedores são escopados à conta de origem (mesmo re_ pode existir em contas distintas)
  const { data: recRows } = await supabase
    .from("pagarme_recipient_map")
    .select("pagarme_recipient_id, company_id, active")
    .eq("pagarme_account_id", account.id)
    .in("pagarme_recipient_id", recipientIds.length > 0 ? recipientIds : ["__none__"])
    .eq("active", true);

  const recipients: RecipientMapEntry[] = [];
  // empresa dona entra sempre (cobrança sem split -> nota dela)
  const companyIds: string[] = [account.ownerCompanyId];
  for (const r of recRows ?? []) {
    // organization_id vem de companies
    companyIds.push(r.company_id as string);
  }

  const { data: companyRows } = await supabase
    .from("companies")
    .select("id, organization_id")
    .in("id", companyIds.length > 0 ? companyIds : ["00000000-0000-0000-0000-000000000000"]);
  const orgByCompany = new Map<string, string>(
    (companyRows ?? []).map((c) => [c.id as string, c.organization_id as string]),
  );

  for (const r of recRows ?? []) {
    const companyId = r.company_id as string;
    recipients.push({
      pagarmeRecipientId: r.pagarme_recipient_id as string,
      companyId,
      organizationId: orgByCompany.get(companyId) ?? "",
    });
  }

  const { data: svcRows } = await supabase
    .from("service_catalog")
    .select(
      "company_id, pagarme_plan_id, item_lista_servico, codigo_tributario_municipio, aliquota_iss",
    )
    .in(
      "company_id",
      companyIds.length > 0 ? companyIds : ["00000000-0000-0000-0000-000000000000"],
    );
  const services: ServiceCatalogEntry[] = (svcRows ?? []).map((s) => ({
    companyId: s.company_id as string,
    pagarmePlanId: (s.pagarme_plan_id as string | null) ?? null,
    itemListaServico: s.item_lista_servico as string,
    codigoTributarioMunicipio: (s.codigo_tributario_municipio as string | null) ?? null,
    aliquotaIss: (s.aliquota_iss as number | null) ?? null,
  }));

  const { data: setRows } = await supabase
    .from("fiscal_company_settings")
    .select(
      "company_id, ambiente, emission_mode, enabled, item_lista_servico, codigo_tributario_municipio, aliquota_iss",
    )
    .in(
      "company_id",
      companyIds.length > 0 ? companyIds : ["00000000-0000-0000-0000-000000000000"],
    );
  const settings: FiscalCompanySettings[] = (setRows ?? []).map((s) => ({
    companyId: s.company_id as string,
    ambiente: s.ambiente as NfseAmbiente,
    emissionMode: s.emission_mode as NfseEmissionMode,
    enabled: Boolean(s.enabled),
    itemListaServico: (s.item_lista_servico as string | null) ?? null,
    codigoTributarioMunicipio: (s.codigo_tributario_municipio as string | null) ?? null,
    aliquotaIss: (s.aliquota_iss as number | null) ?? null,
  }));

  return { account, recipients, services, settings };
}

function toRow(draft: InvoiceJobDraft): Record<string, unknown> {
  return {
    organization_id: draft.organizationId,
    company_id: draft.companyId,
    pagarme_account_id: draft.pagarmeAccountId,
    pagarme_charge_id: draft.pagarmeChargeId,
    pagarme_recipient_id: draft.pagarmeRecipientId,
    ambiente: draft.ambiente,
    status: draft.status,
    valor_servicos: draft.valorServicos,
    tomador_documento: draft.tomadorDocumento,
    tomador_nome: draft.tomadorNome,
    tomador_email: draft.tomadorEmail,
    tomador_endereco: draft.tomadorEndereco,
    item_lista_servico: draft.itemListaServico,
    codigo_tributario_municipio: draft.codigoTributarioMunicipio,
    aliquota_iss: draft.aliquotaIss,
    metadata: draft.metadata,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // a conta de origem é endereçada pelo slug na URL (?account=<slug>)
  const url = new URL(req.url);
  const slug = url.searchParams.get("account") ?? "";
  const provided = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (!slug) return json({ error: "missing_account" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // verificação de origem: segredo PRÓPRIO da conta (no Vault). Sem conta/segredo -> rejeita.
  const account = await loadAccount(supabase, slug);
  if (!account) return json({ error: "unknown_account" }, 404);

  const { data: expectedSecret } = await supabase.rpc("get_pagarme_webhook_secret", {
    p_slug: slug,
  });
  if (!expectedSecret || provided !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const eventId = typeof payload.id === "string" ? payload.id : "";
  const eventType = typeof payload.type === "string" ? payload.type : "";
  if (!eventId) return json({ error: "missing_event_id" }, 400);

  const data = (payload.data ?? {}) as Record<string, unknown>;

  // 1) ingest idempotente em sales_events (carimba a conta de origem)
  const { data: inserted, error: salesErr } = await supabase
    .from("sales_events")
    .upsert(
      {
        provider: "pagarme",
        pagarme_account_id: account.id,
        event_id: eventId,
        event_type: eventType,
        resource_id: typeof data.id === "string" ? data.id : null,
        payload,
      },
      { onConflict: "provider,event_id", ignoreDuplicates: true },
    )
    .select("id");

  if (salesErr) return json({ error: "sales_event_failed", detail: salesErr.message }, 500);
  if (!inserted || inserted.length === 0) {
    return json({ status: "duplicate_ignored", eventId });
  }

  if (eventType !== "charge.paid") {
    await markProcessed(supabase, eventId);
    return json({ status: "ignored", eventType, eventId });
  }

  const event = parseChargePaidWebhook(payload);
  if (!event) {
    await markProcessed(supabase, eventId, "not_charge_paid");
    return json({ status: "not_charge_paid", eventId });
  }

  // explode: COM split -> N jobs (recebedores da conta); SEM split -> 1 job da empresa dona
  const ctx = await loadContext(
    supabase,
    account,
    event.split.map((s) => s.recipientId),
  );
  const { jobs, skipped } = explodeChargePaid(event, ctx);

  if (jobs.length > 0) {
    const { error: jobsErr } = await supabase.from("invoice_jobs").upsert(jobs.map(toRow), {
      onConflict: "pagarme_charge_id,pagarme_recipient_id",
      ignoreDuplicates: true,
    });
    if (jobsErr) return json({ error: "invoice_jobs_failed", detail: jobsErr.message }, 500);
  }

  await markProcessed(supabase, eventId);
  return json({ status: "processed", created: jobs.length, skipped });
});

async function markProcessed(
  supabase: SupabaseClient,
  eventId: string,
  note?: string,
): Promise<void> {
  await supabase
    .from("sales_events")
    .update({ processed_at: new Date().toISOString(), process_error: note ?? null })
    .eq("provider", "pagarme")
    .eq("event_id", eventId);
}
