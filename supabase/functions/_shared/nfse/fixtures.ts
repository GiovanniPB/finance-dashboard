/**
 * Fixtures para os testes da explosão de split (Camada 0 — sem terceiros).
 * Builders retornam objetos novos a cada chamada (sem estado compartilhado).
 *
 * NOTA: a forma de `ChargePaidEvent` é a normalizada; o mapeamento do payload
 * bruto do pagar.me será validado contra a sandbox na Fase 2.
 */

import type { ChargePaidEvent, ExplodeContext } from "./types.ts";

const ORG = "00000000-0000-0000-0000-0000000000aa";
const COMPANY_A = "00000000-0000-0000-0000-0000000000a1";
const COMPANY_B = "00000000-0000-0000-0000-0000000000b2";

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

export const IDS = { ORG, COMPANY_A, COMPANY_B };
