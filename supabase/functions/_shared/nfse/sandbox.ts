/**
 * Builder PURO do corpo de `POST /orders` para o ambiente de TESTE (sandbox) do
 * pagar.me. Gera cobranças de teste que percorrem o pipeline real (webhook →
 * split → invoice_jobs) sem dinheiro real.
 *
 * Regras do sandbox (confirmadas na doc do pagar.me — ver docs/integrations):
 *  - Cartão: o NÚMERO do cartão decide o status (4000…0010 = pago, …0028 =
 *    recusado, …0069 = pago→chargeback, …0051 = processing→cancelado). Suporta split.
 *  - Pix: o VALOR decide — ≤ R$ 500,00 nasce pending e auto-paga em segundos;
 *    > R$ 500,00 nasce failed. ⚠️ Pix no sandbox NÃO suporta split.
 *  - Boleto: o CEP do tomador decide a conciliação (default = pago integral;
 *    01046010 = pago a menor; 57400000 = pago a maior; 70070300 = não concilia).
 *
 * Separação puro/IO (mesmo padrão de payables.ts): este módulo só MONTA o
 * payload e valida a entrada; o HTTP `POST /orders` vive na Edge Function (Deno).
 */

import type { PagarmeSplit } from "./types.ts";

export type SandboxMethod = "credit_card" | "pix" | "boleto";

/** Cartões de teste do simulador pagar.me → status simulado. */
export const SANDBOX_TEST_CARDS = {
  paid: "4000000000000010",
  refused: "4000000000000028",
  chargeback: "4000000000000069",
  processing_canceled: "4000000000000051",
} as const;

/** CEPs do simulador de boleto → cenário de conciliação. */
export const SANDBOX_BOLETO_CEP = {
  underpaid: "01046010",
  overpaid: "57400000",
  unreconciled: "70070300",
} as const;

/** Teto (centavos) do cenário de SUCESSO do Pix no sandbox (R$ 500,00). */
export const SANDBOX_PIX_PAID_MAX_CENTS = 50000;

/** Cenários válidos por método (a UI usa isto para montar os selects). */
export const SANDBOX_SCENARIOS: Record<SandboxMethod, readonly string[]> = {
  credit_card: ["paid", "refused", "chargeback", "processing_canceled"],
  pix: ["paid", "failed"],
  boleto: ["paid", "underpaid", "overpaid", "unreconciled"],
} as const;

export interface SandboxCustomerInput {
  name: string;
  email: string;
  document?: string | null; // CPF/CNPJ (só números)
  documentType?: "CPF" | "CNPJ";
  address?: {
    line_1: string;
    line_2?: string | null;
    zip_code: string;
    city: string;
    state: string;
    country?: string;
  } | null;
  phone?: { areaCode: string; number: string } | null;
}

export interface SandboxOrderInput {
  method: SandboxMethod;
  scenario: string;
  amountCents: number;
  description?: string | null;
  customer: SandboxCustomerInput;
  /** Split opcional (cartão/boleto). Ignorado/proibido no Pix. */
  split?: PagarmeSplit[];
}

export interface SandboxOrderBuild {
  /** Corpo pronto para `POST /orders`. Só é confiável quando `errors` está vazio. */
  payload: Record<string, unknown>;
  /** Erros de validação — não-vazio ⇒ NÃO enviar ao pagar.me (responder 422). */
  errors: string[];
}

const DEFAULT_BILLING_ADDRESS = {
  line_1: "1, Rua de Teste, Centro",
  zip_code: "06401000",
  city: "Barueri",
  state: "SP",
  country: "BR",
} as const;

function buildCustomer(
  customer: SandboxCustomerInput,
  method: SandboxMethod,
  scenario: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { name: customer.name, email: customer.email };

  if (customer.document) {
    out.document = customer.document;
    out.document_type = customer.documentType ?? "CPF";
    out.type = customer.documentType === "CNPJ" ? "company" : "individual";
  }

  if (customer.address) {
    // No boleto o CEP do tomador É o gatilho do cenário de conciliação.
    const zip =
      method === "boleto"
        ? (SANDBOX_BOLETO_CEP[scenario as keyof typeof SANDBOX_BOLETO_CEP] ??
          customer.address.zip_code)
        : customer.address.zip_code;
    out.address = {
      line_1: customer.address.line_1,
      line_2: customer.address.line_2 ?? null,
      zip_code: zip,
      city: customer.address.city,
      state: customer.address.state,
      country: customer.address.country ?? "BR",
    };
  }

  // Pix exige telefone do pagador.
  if (method === "pix") {
    out.phones = {
      mobile_phone: {
        country_code: "55",
        area_code: customer.phone?.areaCode ?? "11",
        number: customer.phone?.number ?? "999999999",
      },
    };
  }

  return out;
}

/** Mapeia o split do domínio para o formato do pagar.me (1º recebedor arca taxas/resto). */
function toPagarmeSplit(splits: PagarmeSplit[]): unknown[] {
  return splits.map((s, i) => ({
    recipient_id: s.recipientId,
    amount: s.amount,
    type: s.type,
    options: {
      charge_processing_fee: i === 0,
      charge_remainder_fee: i === 0,
      liable: i === 0,
    },
  }));
}

function buildPayment(input: SandboxOrderInput): Record<string, unknown> {
  const { method, scenario, split } = input;

  if (method === "credit_card") {
    const number =
      SANDBOX_TEST_CARDS[scenario as keyof typeof SANDBOX_TEST_CARDS] ?? SANDBOX_TEST_CARDS.refused;
    const payment: Record<string, unknown> = {
      payment_method: "credit_card",
      credit_card: {
        operation_type: "auth_and_capture",
        installments: 1,
        statement_descriptor: "TESTNFSE",
        card: {
          number,
          holder_name: input.customer.name || "Tomador Teste",
          exp_month: 12,
          exp_year: 30,
          cvv: "123",
          billing_address: input.customer.address
            ? {
                line_1: input.customer.address.line_1,
                zip_code: input.customer.address.zip_code,
                city: input.customer.address.city,
                state: input.customer.address.state,
                country: input.customer.address.country ?? "BR",
              }
            : { ...DEFAULT_BILLING_ADDRESS },
        },
      },
    };
    if (split && split.length > 0) payment.split = toPagarmeSplit(split);
    return payment;
  }

  if (method === "pix") {
    // Pix no sandbox NÃO suporta split (validado em validateInput).
    return { payment_method: "pix", pix: { expires_in: 3600 } };
  }

  // boleto
  const payment: Record<string, unknown> = {
    payment_method: "boleto",
    boleto: { instructions: "Cobrança de teste — esteira NFS-e (sandbox)" },
  };
  if (split && split.length > 0) payment.split = toPagarmeSplit(split);
  return payment;
}

function validateInput(input: SandboxOrderInput): string[] {
  const errors: string[] = [];
  const { method, scenario, amountCents, customer, split } = input;

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    errors.push("amountCents deve ser inteiro positivo (centavos).");
  }
  if (!customer?.name) errors.push("customer.name é obrigatório.");
  if (!customer?.email) errors.push("customer.email é obrigatório.");

  const allowed = SANDBOX_SCENARIOS[method];
  if (!allowed) {
    errors.push(`método inválido: ${method}.`);
    return errors;
  }
  if (!allowed.includes(scenario)) {
    errors.push(`cenário '${scenario}' inválido para ${method} (use: ${allowed.join(", ")}).`);
  }

  if (method === "pix") {
    if (split && split.length > 0) {
      errors.push("Pix no sandbox do pagar.me não suporta split — use sem split (empresa dona).");
    }
    if (scenario === "paid" && amountCents > SANDBOX_PIX_PAID_MAX_CENTS) {
      errors.push("Pix pago no sandbox exige valor ≤ R$ 500,00 (50000 centavos).");
    }
    if (scenario === "failed" && amountCents <= SANDBOX_PIX_PAID_MAX_CENTS) {
      errors.push("Pix falho no sandbox exige valor > R$ 500,00 (50000 centavos).");
    }
  }

  if (method === "boleto") {
    if (!customer?.document) errors.push("Boleto registrado exige customer.document (CPF/CNPJ).");
    if (!customer?.address) errors.push("Boleto registrado exige customer.address.");
  }

  return errors;
}

/**
 * Monta (puro) o corpo de `POST /orders` do sandbox a partir da entrada do
 * formulário. Sempre retorna `{ payload, errors }`; com `errors` não-vazio o
 * chamador deve responder 422 sem chamar o pagar.me.
 */
export function buildSandboxOrder(input: SandboxOrderInput): SandboxOrderBuild {
  const errors = validateInput(input);

  const payload: Record<string, unknown> = {
    items: [
      {
        amount: input.amountCents,
        description: input.description || "Cobrança de teste — esteira NFS-e",
        quantity: 1,
        code: "TEST-NFSE",
      },
    ],
    customer: buildCustomer(input.customer, input.method, input.scenario),
    payments: [buildPayment(input)],
    closed: true,
    code: `test-${input.method}-${input.scenario}`,
    // carimbo que identifica/filtra cobranças de teste (purga posterior)
    metadata: { test: "true", source: "pagarme-sandbox", scenario: input.scenario },
  };

  return { payload, errors };
}
