/**
 * Explosão do split do pagar.me em rascunhos de NFS-e (invoice_jobs).
 *
 * Regra central: 1 `charge.paid` (com split) -> N `invoice_jobs`, um por
 * recebedor mapeado a uma empresa nossa, cada um com a sua fatia do valor.
 *
 * Funções **puras e determinísticas** (sem I/O, sem random, sem relógio):
 * - `focus_ref` e `created_at` são default do banco;
 * - idempotência é garantida no insert (índice único charge×recipient).
 *
 * Premissa do domínio: o split cobre o valor inteiro da cobrança entre
 * empresas cadastradas (assinatura dividida entre 2+ empresas). Logo a soma
 * das fatias dos jobs = total da cobrança.
 *
 * Vive em `_shared` (Deno-puro) para ser usado pelas Edge Functions e testado
 * pelo Vitest.
 */

import { enrichTomadorAddress } from "./address.ts";
import { isValidDocument } from "./document.ts";
import { resolveFiscalParametros } from "./parametros.ts";
import type {
  ChargePaidEvent,
  ExplodeContext,
  ExplodeResult,
  FiscalCompanySettings,
  FiscalDocumentType,
  InvoiceJobDraft,
  InvoiceJobStatus,
  PagarmeAccount,
  PagarmeAddress,
  PagarmeCustomer,
  PagarmeSplit,
  ServiceCatalogEntry,
} from "./types.ts";

/** Centavos -> reais (numeric(18,2)). Inline para manter o módulo sem deps. */
function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Distribui o valor total (centavos) entre as entradas do split, preservando
 * a soma exata via maior-resto (largest remainder). Entradas `flat` usam o
 * próprio valor; `percentage` usam `total * pct / 100`. O resto de
 * arredondamento é distribuído de forma determinística (maior parte
 * fracionária primeiro; empate desempata por índice).
 */
export function allocateShares(totalCents: number, split: readonly PagarmeSplit[]): number[] {
  if (split.length === 0) return [];

  const ideals = split.map((entry) =>
    entry.type === "flat" ? entry.amount : (totalCents * entry.amount) / 100,
  );
  const shares = ideals.map((value) => Math.floor(value));

  let remainder = totalCents - shares.reduce((acc, value) => acc + value, 0);

  const order = ideals
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : a.index - b.index));

  const step = remainder >= 0 ? 1 : -1;
  let cursor = 0;
  while (remainder !== 0 && order.length > 0) {
    const target = order[cursor % order.length].index;
    shares[target] += step;
    remainder -= step;
    cursor += 1;
  }

  return shares;
}

interface ResolvedTomador {
  documento: string | null;
  nome: string | null;
  email: string | null;
  endereco: PagarmeAddress | null;
  valid: boolean;
  warnings: string[];
}

function hasCompleteAddress(address: PagarmeAddress | null | undefined): boolean {
  // Híbrido: derivamos logradouro/numero/bairro do pagar.me; se faltar algo
  // exigido pelo Focus, o endereço é considerado incompleto -> revisão manual.
  return enrichTomadorAddress(address).complete;
}

/** Valida e normaliza o tomador (CPF/CNPJ + endereço obrigatórios em Barueri). */
export function resolveTomador(customer: PagarmeCustomer): ResolvedTomador {
  const documento = customer.document ?? null;
  const endereco = customer.address ?? null;
  const warnings: string[] = [];

  const docValid = documento !== null && isValidDocument(documento);
  if (!docValid) warnings.push("tomador_documento_invalido");
  if (!hasCompleteAddress(endereco)) warnings.push("tomador_endereco_incompleto");
  if (!customer.name) warnings.push("tomador_nome_ausente");

  return {
    documento,
    nome: customer.name ?? null,
    email: customer.email ?? null,
    endereco,
    valid: warnings.length === 0,
    warnings,
  };
}

function resolveService(
  services: readonly ServiceCatalogEntry[],
  companyId: string,
  planId: string | null | undefined,
  documentType: FiscalDocumentType,
): ServiceCatalogEntry | undefined {
  // entradas do catálogo só valem para o tipo de documento da empresa
  const forCompany = services.filter(
    (service) =>
      service.companyId === companyId && (service.documentType ?? "nfse") === documentType,
  );
  // 1) match exato por plano; 2) entrada sem plano (padrão da empresa)
  return (
    forCompany.find((service) => planId != null && service.pagarmePlanId === planId) ??
    forCompany.find((service) => service.pagarmePlanId == null)
  );
}

function initialStatus(
  settings: FiscalCompanySettings | undefined,
  tomadorValid: boolean,
): InvoiceJobStatus {
  // kill-switch, settings ausentes ou tomador inválido -> revisão manual
  if (!settings || !settings.enabled || !tomadorValid) return "pending_review";
  return settings.emissionMode === "automatic" ? "queued" : "pending_review";
}

interface JobInput {
  account: PagarmeAccount;
  companyId: string;
  organizationId: string;
  recipientId: string | null;
  valorCents: number;
  planId: string | null | undefined;
  tomador: ResolvedTomador;
  eventId: string;
  chargeId: string;
  chargeCreatedAt: string | null;
  paidAt: string | null;
  noSplit: boolean;
}

/** Monta um `InvoiceJobDraft` resolvendo classificação fiscal (service_catalog > settings). */
function buildJob(
  input: JobInput,
  services: readonly ServiceCatalogEntry[],
  settings: FiscalCompanySettings | undefined,
): InvoiceJobDraft {
  const documentType: FiscalDocumentType = settings?.documentType ?? "nfse";
  const service = resolveService(services, input.companyId, input.planId, documentType);

  // NFS-e: mantidas como colunas por compat (null em jobs de NF-e)
  const itemListaServico = service?.itemListaServico ?? settings?.itemListaServico ?? null;
  const aliquotaIss = service?.aliquotaIss ?? settings?.aliquotaIss ?? null;
  const codigoTributarioMunicipio =
    service?.codigoTributarioMunicipio ?? settings?.codigoTributarioMunicipio ?? null;

  // snapshot dos parâmetros fiscais resolvidos (forma específica por documentType)
  const parametros = resolveFiscalParametros(documentType, service, settings);

  const metadata: Record<string, unknown> = { sourceEventId: input.eventId };
  if (input.noSplit) metadata.noSplit = true;
  if (input.tomador.warnings.length > 0) metadata.validationWarnings = input.tomador.warnings;

  return {
    organizationId: input.organizationId,
    companyId: input.companyId,
    documentType,
    pagarmeAccountId: input.account.id,
    pagarmeChargeId: input.chargeId,
    pagarmeRecipientId: input.recipientId,
    ambiente: settings?.ambiente ?? input.account.ambiente,
    status: initialStatus(settings, input.tomador.valid),
    valorServicos: fromCents(input.valorCents),
    chargeCreatedAt: input.chargeCreatedAt,
    paidAt: input.paidAt,
    tomadorDocumento: input.tomador.documento,
    tomadorNome: input.tomador.nome,
    tomadorEmail: input.tomador.email,
    tomadorEndereco: input.tomador.endereco,
    itemListaServico,
    codigoTributarioMunicipio,
    aliquotaIss,
    parametros,
    metadata,
  };
}

/**
 * Explode um `charge.paid` em rascunhos de invoice_jobs:
 *  - COM split  -> um job por recebedor mapeado na conta, cada um com sua fatia;
 *  - SEM split  -> um único job para a empresa DONA da conta, com o valor cheio.
 */
export function explodeChargePaid(event: ChargePaidEvent, ctx: ExplodeContext): ExplodeResult {
  const recipientById = new Map(ctx.recipients.map((r) => [r.pagarmeRecipientId, r]));
  const settingsByCompany = new Map(ctx.settings.map((s) => [s.companyId, s]));
  const tomador = resolveTomador(event.customer);

  const jobs: InvoiceJobDraft[] = [];
  const skipped: ExplodeResult["skipped"] = [];

  // Cobrança sem split -> nota da empresa dona da conta (valor integral).
  if (event.split.length === 0) {
    jobs.push(
      buildJob(
        {
          account: ctx.account,
          companyId: ctx.account.ownerCompanyId,
          organizationId: ctx.account.organizationId,
          recipientId: null,
          valorCents: event.amountCents,
          planId: event.planId,
          tomador,
          eventId: event.eventId,
          chargeId: event.chargeId,
          chargeCreatedAt: event.chargeCreatedAt,
          paidAt: event.paidAt,
          noSplit: true,
        },
        ctx.services,
        settingsByCompany.get(ctx.account.ownerCompanyId),
      ),
    );
    return { jobs, skipped };
  }

  const shares = allocateShares(event.amountCents, event.split);

  // Agrupa as pernas por EMPRESA: a unidade de nota (e a chave de idempotência
  // no banco) é "uma nota por empresa por cobrança", então duas pernas do split
  // que caem na mesma empresa somam numa nota só. Sem isso o banco engoliria a
  // segunda perna em silêncio e a empresa receberia nota a menos.
  interface CompanyLeg {
    companyId: string;
    organizationId: string;
    recipientId: string;
    extraRecipientIds: string[];
    valorCents: number;
  }
  const byCompany = new Map<string, CompanyLeg>();

  event.split.forEach((entry, index) => {
    const recipient = recipientById.get(entry.recipientId);
    if (!recipient) {
      skipped.push({ recipientId: entry.recipientId, reason: "recipient_not_mapped" });
      return;
    }

    const acc = byCompany.get(recipient.companyId);
    if (acc) {
      acc.valorCents += shares[index];
      acc.extraRecipientIds.push(entry.recipientId);
      return;
    }
    byCompany.set(recipient.companyId, {
      companyId: recipient.companyId,
      organizationId: recipient.organizationId,
      recipientId: entry.recipientId,
      extraRecipientIds: [],
      valorCents: shares[index],
    });
  });

  for (const leg of byCompany.values()) {
    const job = buildJob(
      {
        account: ctx.account,
        companyId: leg.companyId,
        organizationId: leg.organizationId,
        recipientId: leg.recipientId,
        valorCents: leg.valorCents,
        planId: event.planId,
        tomador,
        eventId: event.eventId,
        chargeId: event.chargeId,
        chargeCreatedAt: event.chargeCreatedAt,
        paidAt: event.paidAt,
        noSplit: false,
      },
      ctx.services,
      settingsByCompany.get(leg.companyId),
    );
    // procedência: quais outros recebedores foram somados nesta nota
    jobs.push(
      leg.extraRecipientIds.length > 0
        ? {
            ...job,
            metadata: {
              ...job.metadata,
              mergedRecipientIds: [leg.recipientId, ...leg.extraRecipientIds],
            },
          }
        : job,
    );
  }

  return { jobs, skipped };
}
