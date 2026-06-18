import { describe, expect, it } from "vitest";

import {
  buildSandboxOrder,
  SANDBOX_BOLETO_CEP,
  SANDBOX_TEST_CARDS,
  type SandboxOrderInput,
} from "./sandbox.ts";

function baseCustomer(): SandboxOrderInput["customer"] {
  return {
    name: "Tomador Teste",
    email: "tomador@example.com",
    document: "52998224725",
    documentType: "CPF",
    address: {
      line_1: "100, Rua Exemplo, Centro",
      zip_code: "06401000",
      city: "Barueri",
      state: "SP",
    },
  };
}

describe("buildSandboxOrder — cartão de crédito", () => {
  it("usa o cartão de teste do cenário e monta auth_and_capture", () => {
    const { payload, errors } = buildSandboxOrder({
      method: "credit_card",
      scenario: "paid",
      amountCents: 29900,
      customer: baseCustomer(),
    });

    expect(errors).toEqual([]);
    const payment = (payload.payments as Record<string, unknown>[])[0];
    expect(payment.payment_method).toBe("credit_card");
    const card = (payment.credit_card as Record<string, unknown>).card as Record<string, unknown>;
    expect(card.number).toBe(SANDBOX_TEST_CARDS.paid);
    expect((payment.credit_card as Record<string, unknown>).operation_type).toBe(
      "auth_and_capture",
    );
  });

  it("seleciona o cartão de recusado conforme o cenário", () => {
    const card = (
      (
        (
          buildSandboxOrder({
            method: "credit_card",
            scenario: "refused",
            amountCents: 1000,
            customer: baseCustomer(),
          }).payload.payments as Record<string, unknown>[]
        )[0].credit_card as Record<string, unknown>
      ).card as Record<string, unknown>
    ).number;
    expect(card).toBe(SANDBOX_TEST_CARDS.refused);
  });

  it("inclui split mapeado (1º recebedor arca taxas/resto/liable)", () => {
    const { payload } = buildSandboxOrder({
      method: "credit_card",
      scenario: "paid",
      amountCents: 29900,
      customer: baseCustomer(),
      split: [
        { recipientId: "re_owner", amount: 60, type: "percentage" },
        { recipientId: "re_other", amount: 40, type: "percentage" },
      ],
    });

    const split = (payload.payments as Record<string, unknown>[])[0].split as Record<
      string,
      unknown
    >[];
    expect(split).toHaveLength(2);
    expect(split[0]).toMatchObject({
      recipient_id: "re_owner",
      amount: 60,
      type: "percentage",
      options: { charge_processing_fee: true, charge_remainder_fee: true, liable: true },
    });
    expect(split[1].options).toMatchObject({
      charge_processing_fee: false,
      charge_remainder_fee: false,
      liable: false,
    });
  });
});

describe("buildSandboxOrder — pix", () => {
  it("aceita pix pago com valor ≤ R$ 500 e sem split", () => {
    const { payload, errors } = buildSandboxOrder({
      method: "pix",
      scenario: "paid",
      amountCents: 50000,
      customer: baseCustomer(),
    });
    expect(errors).toEqual([]);
    const payment = (payload.payments as Record<string, unknown>[])[0];
    expect(payment.payment_method).toBe("pix");
    expect((payload.customer as Record<string, unknown>).phones).toBeDefined();
  });

  it("rejeita pix pago acima de R$ 500", () => {
    const { errors } = buildSandboxOrder({
      method: "pix",
      scenario: "paid",
      amountCents: 50001,
      customer: baseCustomer(),
    });
    expect(errors.some((e) => e.includes("≤ R$ 500"))).toBe(true);
  });

  it("rejeita pix com split (não suportado no sandbox)", () => {
    const { errors } = buildSandboxOrder({
      method: "pix",
      scenario: "paid",
      amountCents: 1000,
      customer: baseCustomer(),
      split: [{ recipientId: "re_x", amount: 100, type: "percentage" }],
    });
    expect(errors.some((e) => e.includes("não suporta split"))).toBe(true);
  });

  it("exige valor > R$ 500 no cenário de falha", () => {
    expect(
      buildSandboxOrder({
        method: "pix",
        scenario: "failed",
        amountCents: 1000,
        customer: baseCustomer(),
      }).errors.some((e) => e.includes("> R$ 500")),
    ).toBe(true);
  });
});

describe("buildSandboxOrder — boleto", () => {
  it("sobrescreve o CEP do tomador conforme o cenário de conciliação", () => {
    const { payload, errors } = buildSandboxOrder({
      method: "boleto",
      scenario: "underpaid",
      amountCents: 12300,
      customer: baseCustomer(),
    });
    expect(errors).toEqual([]);
    const address = (payload.customer as Record<string, unknown>).address as Record<
      string,
      unknown
    >;
    expect(address.zip_code).toBe(SANDBOX_BOLETO_CEP.underpaid);
  });

  it("mantém o CEP informado no cenário pago", () => {
    const address = (
      buildSandboxOrder({
        method: "boleto",
        scenario: "paid",
        amountCents: 12300,
        customer: baseCustomer(),
      }).payload.customer as Record<string, unknown>
    ).address as Record<string, unknown>;
    expect(address.zip_code).toBe("06401000");
  });

  it("exige documento e endereço do tomador", () => {
    const { errors } = buildSandboxOrder({
      method: "boleto",
      scenario: "paid",
      amountCents: 12300,
      customer: { name: "X", email: "x@example.com" },
    });
    expect(errors.some((e) => e.includes("customer.document"))).toBe(true);
    expect(errors.some((e) => e.includes("customer.address"))).toBe(true);
  });
});

describe("buildSandboxOrder — validações gerais", () => {
  it("rejeita valor não-positivo e cenário inválido", () => {
    const { errors } = buildSandboxOrder({
      method: "credit_card",
      scenario: "inexistente",
      amountCents: 0,
      customer: baseCustomer(),
    });
    expect(errors.some((e) => e.includes("amountCents"))).toBe(true);
    expect(errors.some((e) => e.includes("inválido"))).toBe(true);
  });

  it("sempre carimba metadata.test e a origem", () => {
    const { payload } = buildSandboxOrder({
      method: "credit_card",
      scenario: "paid",
      amountCents: 1000,
      customer: baseCustomer(),
    });
    expect(payload.metadata).toMatchObject({ test: "true", source: "pagarme-sandbox" });
  });
});
