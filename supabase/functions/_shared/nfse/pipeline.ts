/**
 * Orquestração compartilhada "charge -> invoice_jobs" (camada de função, Deno).
 *
 * Vive em `_shared` para ser usada por AMBOS os produtores de jobs sem
 * divergência: o `pagarme-webhook` (fluxo passivo) e o `nfse-backfill` (emissão
 * retroativa). Diferente dos demais módulos de `_shared` (puros/fetch), este
 * recebe o **client do Supabase** (service role) — mas só o TIPO é importado
 * (apagado em runtime); o client é criado na Edge Function e passado aqui.
 *
 * Peças puras (parse/split/explode) continuam nos seus módulos; aqui fica a cola
 * que toca o banco (contexto fiscal) e as APIs (payables/ViaCEP).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchCepInfo } from "./cep.ts";
import { fetchChargeSplit } from "./payables.ts";
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
} from "./types.ts";

/** Monta a classificação de produto (NF-e) a partir de uma linha de service_catalog. */
export function mapNfeClassification(s: Record<string, unknown>): NfeProductClassification {
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

/** Carrega o contexto de explosão (recebedores + settings + services da conta). */
export async function loadContext(
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
export async function enrichEventAddress(event: ChargePaidEvent): Promise<ChargePaidEvent> {
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
 * Resolve o split AUTORITATIVO da venda via `/payables` (crédito − estorno):
 *  - soma == valor pago -> usa o split dos payables (confiável);
 *  - divergência -> mantém o split de origem mas sinaliza p/ revisão manual;
 *  - indisponível / sem key -> mantém o split de origem.
 * `p_apiKey` opcional: quando o chamador já tem a secret key (backfill), evita
 * o RPC por cobrança; sem ele, busca via `get_pagarme_account_secret` (webhook).
 */
export async function resolveAuthoritativeSplit(
  supabase: SupabaseClient,
  account: PagarmeAccount,
  event: ChargePaidEvent,
  apiKey?: string,
): Promise<{ event: ChargePaidEvent; splitMeta: Record<string, unknown> }> {
  let key = apiKey;
  if (!key) {
    const { data } = await supabase.rpc("get_pagarme_account_secret", { p_account_id: account.id });
    key = typeof data === "string" ? data : undefined;
  }
  if (!key || key.length === 0) {
    return { event, splitMeta: { splitSource: "webhook" } };
  }

  const payables = await fetchChargeSplit(event.chargeId, key);
  if (!payables || payables.split.length === 0) {
    return { event, splitMeta: { splitSource: "webhook", payablesUnavailable: true } };
  }

  if (payables.totalCents !== event.amountCents) {
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
export function applySplitMeta(
  draft: InvoiceJobDraft,
  splitMeta: Record<string, unknown>,
): InvoiceJobDraft {
  return {
    ...draft,
    status: splitMeta.payablesDivergence ? "pending_review" : draft.status,
    metadata: { ...draft.metadata, ...splitMeta },
  };
}

/** Converte um draft na linha de `invoice_jobs` (colunas do banco). */
export function toRow(draft: InvoiceJobDraft): Record<string, unknown> {
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
