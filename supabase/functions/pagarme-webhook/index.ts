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

import { fetchCepInfo } from "../_shared/nfse/cep.ts";
import { parseChargePaidWebhook } from "../_shared/nfse/parse.ts";
import { fetchChargeSplit } from "../_shared/nfse/payables.ts";
import { explodeChargePaid } from "../_shared/nfse/split.ts";
import type {
  ChargePaidEvent,
  ExplodeContext,
  FiscalCompanySettings,
  FiscalDocumentType,
  InvoiceJobDraft,
  NfeProductClassification,
  NfseAmbiente,
  NfseEmissionMode,
  PagarmeAccount,
  PagarmeAddress,
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

/** Monta a classificação de produto (NF-e) a partir de uma linha de service_catalog. */
function mapNfeClassification(s: Record<string, unknown>): NfeProductClassification {
  return {
    codigoProduto: (s.codigo_produto as string | null) ?? null,
    descricao: (s.descricao as string | null) ?? null,
    ncm: (s.ncm as string | null) ?? null,
    cest: (s.cest as string | null) ?? null,
    cfopInterno: (s.cfop_interno as string | null) ?? null,
    cfopInterestadual: (s.cfop_interestadual as string | null) ?? null,
    origem: (s.origem as number | null) ?? null,
    cstIcms: (s.cst_icms as string | null) ?? null,
    codigoBeneficioFiscal: (s.codigo_beneficio_fiscal as string | null) ?? null,
    pisCst: (s.pis_cst as string | null) ?? null,
    pisAliquota: (s.pis_aliquota as number | null) ?? null,
    cofinsCst: (s.cofins_cst as string | null) ?? null,
    cofinsAliquota: (s.cofins_aliquota as number | null) ?? null,
    infoComplementar: ((s.parametros as Record<string, unknown> | null)?.info_complementar ??
      null) as string | null,
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
      "company_id, document_type, pagarme_plan_id, descricao, item_lista_servico, codigo_tributario_municipio, aliquota_iss, discriminacao, ncm, cest, cfop_interno, cfop_interestadual, origem, cst_icms, codigo_beneficio_fiscal, pis_cst, pis_aliquota, cofins_cst, cofins_aliquota, codigo_produto, parametros",
    )
    .in(
      "company_id",
      companyIds.length > 0 ? companyIds : ["00000000-0000-0000-0000-000000000000"],
    );
  const services: ServiceCatalogEntry[] = (svcRows ?? []).map((s) => ({
    companyId: s.company_id as string,
    documentType: (s.document_type as FiscalDocumentType | null) ?? "nfse",
    pagarmePlanId: (s.pagarme_plan_id as string | null) ?? null,
    itemListaServico: (s.item_lista_servico as string | null) ?? null,
    codigoTributarioMunicipio: (s.codigo_tributario_municipio as string | null) ?? null,
    aliquotaIss: (s.aliquota_iss as number | null) ?? null,
    discriminacao: (s.discriminacao as string | null) ?? null,
    nfe: mapNfeClassification(s),
  }));

  const { data: setRows } = await supabase
    .from("fiscal_company_settings")
    .select(
      "company_id, document_type, ambiente, emission_mode, enabled, municipio_ibge, inscricao_municipal, item_lista_servico, codigo_tributario_municipio, aliquota_iss, iss_retido, optante_simples, discriminacao, codigo_opcao_simples_nacional, regime_tributario_simples_nacional, inscricao_estadual, regime_tributario, serie, emitente_endereco, parametros",
    )
    .in(
      "company_id",
      companyIds.length > 0 ? companyIds : ["00000000-0000-0000-0000-000000000000"],
    );
  const settings: FiscalCompanySettings[] = (setRows ?? []).map((s) => ({
    companyId: s.company_id as string,
    documentType: (s.document_type as FiscalDocumentType | null) ?? "nfse",
    ambiente: s.ambiente as NfseAmbiente,
    emissionMode: s.emission_mode as NfseEmissionMode,
    enabled: Boolean(s.enabled),
    municipioIbge: (s.municipio_ibge as string | null) ?? null,
    inscricaoMunicipal: (s.inscricao_municipal as string | null) ?? null,
    itemListaServico: (s.item_lista_servico as string | null) ?? null,
    codigoTributarioMunicipio: (s.codigo_tributario_municipio as string | null) ?? null,
    aliquotaIss: (s.aliquota_iss as number | null) ?? null,
    issRetido: (s.iss_retido as boolean | null) ?? null,
    optanteSimples: (s.optante_simples as boolean | null) ?? null,
    discriminacao: (s.discriminacao as string | null) ?? null,
    codigoOpcaoSimplesNacional: (s.codigo_opcao_simples_nacional as number | null) ?? null,
    regimeTributarioSimplesNacional:
      (s.regime_tributario_simples_nacional as number | null) ?? null,
    inscricaoEstadual: (s.inscricao_estadual as string | null) ?? null,
    regimeTributario: (s.regime_tributario as number | null) ?? null,
    serie: (s.serie as string | null) ?? null,
    emitenteEndereco: (s.emitente_endereco as PagarmeAddress | null) ?? null,
    parametros: (s.parametros as Record<string, unknown> | null) ?? null,
  }));

  return { account, recipients, services, settings };
}

/** Enriquece (imutável) o endereço do tomador com ViaCEP, se ainda não houver. */
async function enrichEventAddress(event: ChargePaidEvent): Promise<ChargePaidEvent> {
  const address = event.customer.address;
  if (!address || address.cep_info) return event;
  const cepInfo = await fetchCepInfo(address.zip_code ?? null);
  if (!cepInfo) return event;
  return {
    ...event,
    customer: { ...event.customer, address: { ...address, cep_info: cepInfo } },
  };
}

/**
 * Resolve o split AUTORITATIVO da venda. Quando a conta tem secret key no Vault,
 * consulta `/payables?charge_id=` (crédito − estorno/chargeback) e:
 *  - se a soma das fatias == valor pago -> usa o split dos payables (confiável);
 *  - se divergir -> mantém o split do webhook mas sinaliza p/ revisão manual;
 *  - se indisponível / sem key -> cai no split do webhook.
 * `splitMeta` é gravado no metadata do job (auditoria da origem do split).
 */
async function resolveAuthoritativeSplit(
  supabase: SupabaseClient,
  account: PagarmeAccount,
  event: ChargePaidEvent,
): Promise<{ event: ChargePaidEvent; splitMeta: Record<string, unknown> }> {
  const { data: apiKey } = await supabase.rpc("get_pagarme_account_secret", {
    p_account_id: account.id,
  });
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return { event, splitMeta: { splitSource: "webhook" } };
  }

  const payables = await fetchChargeSplit(event.chargeId, apiKey);
  if (!payables || payables.split.length === 0) {
    return { event, splitMeta: { splitSource: "webhook", payablesUnavailable: true } };
  }

  if (payables.totalCents !== event.amountCents) {
    // divergência de valor: não auto-emite — força revisão (applySplitMeta).
    return {
      event,
      splitMeta: {
        splitSource: "webhook",
        payablesDivergence: true,
        payablesTotalCents: payables.totalCents,
        paidCents: event.amountCents,
      },
    };
  }

  return { event: { ...event, split: payables.split }, splitMeta: { splitSource: "payables" } };
}

/** Carimba a origem do split no metadata; em divergência, força revisão manual. */
function applySplitMeta(
  draft: InvoiceJobDraft,
  splitMeta: Record<string, unknown>,
): InvoiceJobDraft {
  return {
    ...draft,
    status: splitMeta.payablesDivergence ? "pending_review" : draft.status,
    metadata: { ...draft.metadata, ...splitMeta },
  };
}

function toRow(draft: InvoiceJobDraft): Record<string, unknown> {
  return {
    organization_id: draft.organizationId,
    company_id: draft.companyId,
    document_type: draft.documentType,
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
    parametros: draft.parametros,
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

  // enriquece o endereço do tomador via ViaCEP (bairro/município/UF + IBGE) — o
  // resultado é "carimbado" em cep_info e usado pela derivação pura do endereço.
  const enrichedEvent = await enrichEventAddress(event);

  // split autoritativo via /payables (quando a conta tem secret key no Vault);
  // senão, cai no split[] do webhook.
  const { event: finalEvent, splitMeta } = await resolveAuthoritativeSplit(
    supabase,
    account,
    enrichedEvent,
  );

  // explode: COM split -> N jobs (recebedores da conta); SEM split -> 1 job da empresa dona
  const ctx = await loadContext(
    supabase,
    account,
    finalEvent.split.map((s) => s.recipientId),
  );
  const { jobs, skipped } = explodeChargePaid(finalEvent, ctx);

  if (jobs.length > 0) {
    const rows = jobs.map((j) => toRow(applySplitMeta(j, splitMeta)));
    const { error: jobsErr } = await supabase.from("invoice_jobs").upsert(rows, {
      onConflict: "pagarme_charge_id,pagarme_recipient_id",
      ignoreDuplicates: true,
    });
    if (jobsErr) return json({ error: "invoice_jobs_failed", detail: jobsErr.message }, 500);
  }

  await markProcessed(supabase, eventId);
  return json({
    status: "processed",
    created: jobs.length,
    splitSource: splitMeta.splitSource,
    skipped,
  });
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
