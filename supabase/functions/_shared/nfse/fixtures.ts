/**
 * Fixtures para os testes da explosão de split (Camada 0 — sem terceiros).
 * Builders retornam objetos novos a cada chamada (sem estado compartilhado).
 *
 * NOTA: a forma de `ChargePaidEvent` é a normalizada; o mapeamento do payload
 * bruto do pagar.me será validado contra a sandbox na Fase 2.
 */

import type { ChargePaidEvent, ExplodeContext, NfeProductClassification } from "./types.ts";

const ORG = "00000000-0000-0000-0000-0000000000aa";
const COMPANY_A = "00000000-0000-0000-0000-0000000000a1";
const COMPANY_B = "00000000-0000-0000-0000-0000000000b2";
const ACCOUNT = "00000000-0000-0000-0000-0000000000ac";

/** CPF válido (mesmo usado nos testes de `lib/document`). */
export const VALID_CPF = "52998224725";

/** charge.paid de assinatura: R$ 299,00, split 60/40 entre duas empresas. */
export function baseEvent(): ChargePaidEvent {
  return {
    eventId: "hook_test_0001",
    chargeId: "ch_test_0001",
    amountCents: 29900,
    planId: "plan_assinatura_basica",
    customer: {
      name: "Cliente Teste",
      email: "cliente@example.com",
      document: VALID_CPF,
      address: {
        line_1: "100, Rua Exemplo, Centro",
        zip_code: "06401000",
        city: "Barueri",
        state: "SP",
        country: "BR",
      },
    },
    split: [
      { recipientId: "rp_company_a", amount: 60, type: "percentage" },
      { recipientId: "rp_company_b", amount: 40, type: "percentage" },
    ],
  };
}

export function baseContext(): ExplodeContext {
  return {
    account: {
      id: ACCOUNT,
      slug: "conta-teste",
      ownerCompanyId: COMPANY_A, // dona: usada em cobrança sem split
      organizationId: ORG,
      ambiente: "homologacao",
    },
    recipients: [
      { pagarmeRecipientId: "rp_company_a", companyId: COMPANY_A, organizationId: ORG },
      { pagarmeRecipientId: "rp_company_b", companyId: COMPANY_B, organizationId: ORG },
    ],
    services: [
      {
        companyId: COMPANY_A,
        pagarmePlanId: "plan_assinatura_basica",
        itemListaServico: "17.01",
        codigoTributarioMunicipio: "170100",
        aliquotaIss: 0.05,
      },
      // empresa B usa o padrão da empresa (entrada sem plano)
      {
        companyId: COMPANY_B,
        pagarmePlanId: null,
        itemListaServico: "10.02",
        aliquotaIss: 0.03,
      },
    ],
    settings: [
      {
        companyId: COMPANY_A,
        ambiente: "homologacao",
        emissionMode: "automatic",
        enabled: true,
      },
      {
        companyId: COMPANY_B,
        ambiente: "homologacao",
        emissionMode: "manual",
        enabled: true,
      },
    ],
  };
}

/**
 * Webhook BRUTO do pagar.me (charge.paid) — formato confirmado contra um
 * payload real de produção (2026-06): envelope v5, split em
 * `data.last_transaction.split[]` com `recipient` ANINHADO (`recipient.id`),
 * sem `plan_id` no charge (a assinatura vem em `data.invoice.subscriptionId`).
 * Dados do tomador/recebedor aqui são SINTÉTICOS (sem PII real no repo).
 */
export function rawChargePaidWebhook(): Record<string, unknown> {
  return {
    id: "hook_test_0001",
    type: "charge.paid",
    created_at: "2026-06-03T12:00:00Z",
    data: {
      id: "ch_test_0001",
      amount: 29900,
      status: "paid",
      customer: {
        name: "Cliente Teste",
        email: "cliente@example.com",
        document: VALID_CPF,
        document_type: "cpf",
        type: "individual",
        address: {
          line_1: "100, Rua Exemplo, Centro",
          zip_code: "06401000",
          city: "Barueri",
          state: "SP",
          country: "BR",
        },
      },
      invoice: {
        id: "in_test_0001",
        subscriptionId: "sub_test_0001",
        status: "paid",
      },
      last_transaction: {
        amount: 29900,
        status: "captured",
        split: [
          {
            amount: 60,
            type: "percentage",
            id: "sr_test_a",
            recipient: { id: "rp_company_a", document: "11111111000111", type: "company" },
          },
          {
            amount: 40,
            type: "percentage",
            id: "sr_test_b",
            recipient: { id: "rp_company_b", document: "22222222000122", type: "company" },
          },
        ],
      },
    },
  };
}

/**
 * Objeto de DETALHE de `GET /charges/{id}` (backfill) — forma confirmada contra
 * um retorno real (2026-07): split em `last_transaction.split[]` com `recipient`
 * ANINHADO, `customer.address` presente (só no detalhe), assinatura em
 * `invoice.subscriptionId`, sem `plan_id`. Dados SINTÉTICOS (sem PII).
 */
export function rawChargeDetail(): Record<string, unknown> {
  return {
    id: "ch_test_0001",
    amount: 29900,
    paid_amount: 29900,
    status: "paid",
    payment_method: "credit_card",
    paid_at: "2026-06-03T12:00:00Z",
    created_at: "2026-06-03T11:59:58Z",
    customer: {
      id: "cus_test_0001",
      name: "Cliente Teste",
      email: "cliente@example.com",
      document: VALID_CPF,
      document_type: "cpf",
      type: "individual",
      address: {
        line_1: "100, Rua Exemplo, Centro",
        zip_code: "06401000",
        city: "Barueri",
        state: "SP",
        country: "BR",
      },
    },
    invoice: { id: "in_test_0001", subscriptionId: "sub_test_0001", status: "paid" },
    last_transaction: {
      amount: 29900,
      status: "captured",
      split: [
        {
          amount: 60,
          type: "percentage",
          id: "sr_test_a",
          recipient: { id: "rp_company_a", document: "11111111000111", type: "company" },
        },
        {
          amount: 40,
          type: "percentage",
          id: "sr_test_b",
          recipient: { id: "rp_company_b", document: "22222222000122", type: "company" },
        },
      ],
    },
  };
}

/**
 * Página de `GET /charges` (lista MAGRA): só id/status + paging, sem address/split.
 * Mistura uma paga e uma não-paga para exercitar o filtro de `parseChargesPage`.
 */
export function chargesListPage(): Record<string, unknown> {
  return {
    data: [
      { id: "ch_test_0001", status: "paid" },
      { id: "ch_unpaid_0002", status: "pending" },
    ],
    paging: { total: 2 },
  };
}

export const IDS = { ORG, COMPANY_A, COMPANY_B, ACCOUNT };

// -----------------------------------------------------------------------------
// Fixtures de NF-e (produto/livro com imunidade) — dados de empresa SINTÉTICOS;
// os códigos fiscais (NCM/CFOP/CST/cBenef/PIS/COFINS) são genéricos, não PII.
// -----------------------------------------------------------------------------

/** Classificação de produto p/ NF-e: livro com imunidade de ICMS (CST 41). */
export const NFE_CLASSIFICATION: NfeProductClassification = {
  codigoProduto: "899",
  descricao: "Curso e Plataforma Exemplo",
  ncm: "49019900",
  cest: "2806400",
  cfopInterno: "5101", // dentro da UF do emitente
  cfopInterestadual: "6107", // outra UF
  origem: 0,
  cstIcms: "41", // não tributada (imunidade de livro)
  codigoBeneficioFiscal: "SP070130", // cBenef SP — exigido p/ CST 41
  pisCst: "01",
  pisAliquota: 0.65, // TRIBUTADO (imunidade é só do ICMS)
  cofinsCst: "01",
  cofinsAliquota: 3.0,
  infoComplementar: "PRODUTO COM IMUNIDADE TRIBUTARIA (livro) - art. 150 VI d CF/88.",
};

/** Emitente sintético de NF-e (estrutura igual à da config real). */
export const NFE_EMITENTE = {
  cnpj: "11222333000181",
  nome: "EMPRESA PRODUTO EXEMPLO LTDA",
  inscricaoEstadual: "111222333444",
  regimeTributario: 3, // Regime Normal (Lucro Presumido)
  endereco: {
    logradouro: "Alameda Exemplo",
    numero: "500",
    complemento: "Sala 1",
    bairro: "Centro",
    municipio: "Barueri",
    uf: "SP",
    cep: "06454000",
  },
};

/**
 * Contexto onde a empresa A emite NF-e (produto) e a B emite NFS-e (serviço) —
 * exercita o roteamento multi-documento do `explodeChargePaid`.
 */
export function nfeContext(): ExplodeContext {
  const ctx = baseContext();
  ctx.settings[0] = {
    ...ctx.settings[0],
    documentType: "nfe",
    inscricaoEstadual: NFE_EMITENTE.inscricaoEstadual,
    regimeTributario: NFE_EMITENTE.regimeTributario,
    serie: "101",
    emitenteEndereco: {
      line_1: `${NFE_EMITENTE.endereco.numero}, ${NFE_EMITENTE.endereco.logradouro}, ${NFE_EMITENTE.endereco.bairro}`,
      zip_code: NFE_EMITENTE.endereco.cep,
      city: NFE_EMITENTE.endereco.municipio,
      state: NFE_EMITENTE.endereco.uf,
    },
  };
  ctx.services = [
    {
      companyId: COMPANY_A,
      documentType: "nfe",
      pagarmePlanId: "plan_assinatura_basica",
      nfe: NFE_CLASSIFICATION,
    },
    // empresa B continua NFS-e (entrada sem plano)
    { companyId: COMPANY_B, pagarmePlanId: null, itemListaServico: "10.02", aliquotaIss: 0.03 },
  ];
  return ctx;
}
