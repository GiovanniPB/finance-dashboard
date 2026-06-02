/**
 * Edge Function: pagarme-webhook
 *
 * Recebe webhooks do pagar.me, grava o evento bruto (idempotente) em
 * `sales_events`, e para `charge.paid` explode o split em `invoice_jobs`
 * (uma NFS-e por empresa-recebedor). Wrapper fino: a lógica de explosão é a
 * função pura `explodeChargePaid` (testada em src/features/nfse).
 *
 * Idempotência:
 *   - `sales_events` (provider, event_id) único -> evento repetido é ignorado;
 *   - `invoice_jobs` (charge, recipient) único -> upsert ignoreDuplicates.
 *
 * NOTA (Fase 2): o parsing do payload BRUTO do pagar.me (`parseChargePaid`)
 * deve ser validado contra a sandbox — a forma exata do split no webhook ainda
 * será confirmada. A lógica de negócio (explosão) já está coberta por testes.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { explodeChargePaid } from "../_shared/nfse/split.ts";
import type {
  ChargePaidEvent,
  ExplodeContext,
  FiscalCompanySettings,
  InvoiceJobDraft,
  NfseAmbiente,
  NfseEmissionMode,
  PagarmeSplit,
  RecipientMapEntry,
  ServiceCatalogEntry,
} from "../_shared/nfse/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("PAGARME_WEBHOOK_SECRET") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Parsing best-effort do webhook charge.paid -> evento normalizado (VERIFICAR na Fase 2). */
function parseChargePaid(payload: Record<string, unknown>): ChargePaidEvent | null {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const chargeId = typeof data.id === "string" ? data.id : "";
  const amount = typeof data.amount === "number" ? data.amount : 0;
  if (!chargeId || amount <= 0) return null;

  const lastTx = (data.last_transaction ?? {}) as Record<string, unknown>;
  const rawSplit = (
    Array.isArray(data.split) ? data.split : Array.isArray(lastTx.split) ? lastTx.split : []
  ) as Array<Record<string, unknown>>;

  const split: PagarmeSplit[] = rawSplit.map((s) => ({
    recipientId: String(s.recipient_id ?? ""),
    amount: typeof s.amount === "number" ? s.amount : 0,
    type: s.type === "flat" ? "flat" : "percentage",
  }));

  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const address = (customer.address ?? null) as ChargePaidEvent["customer"]["address"];

  return {
    eventId: String(payload.id ?? ""),
    chargeId,
    amountCents: amount,
    planId: typeof data.plan_id === "string" ? data.plan_id : null,
    customer: {
      name: typeof customer.name === "string" ? customer.name : null,
      email: typeof customer.email === "string" ? customer.email : null,
      document: typeof customer.document === "string" ? customer.document : null,
      address,
    },
    split,
  };
}

async function loadContext(
  supabase: SupabaseClient,
  recipientIds: string[],
): Promise<ExplodeContext> {
  const { data: recRows } = await supabase
    .from("pagarme_recipient_map")
    .select("pagarme_recipient_id, company_id, active")
    .in("pagarme_recipient_id", recipientIds)
    .eq("active", true);

  const recipients: RecipientMapEntry[] = [];
  const companyIds: string[] = [];
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

  return { recipients, services, settings };
}

function toRow(draft: InvoiceJobDraft): Record<string, unknown> {
  return {
    organization_id: draft.organizationId,
    company_id: draft.companyId,
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

  // verificação de origem (segredo na URL/header) — obrigatória em produção
  const url = new URL(req.url);
  const provided = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (WEBHOOK_SECRET && provided !== WEBHOOK_SECRET) {
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const data = (payload.data ?? {}) as Record<string, unknown>;

  // 1) ingest idempotente em sales_events
  const { data: inserted, error: salesErr } = await supabase
    .from("sales_events")
    .upsert(
      {
        provider: "pagarme",
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

  const event = parseChargePaid(payload);
  if (!event || event.split.length === 0) {
    await markProcessed(supabase, eventId, "no_split");
    return json({ status: "no_split", eventId });
  }

  const ctx = await loadContext(
    supabase,
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
