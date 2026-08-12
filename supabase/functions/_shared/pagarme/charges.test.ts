import { describe, expect, it } from "vitest";

import { parseChargeRecord, parseChargesListPage } from "./charges.ts";
import {
  CHARGE_FAILED_RAW,
  CHARGE_LIST_ITEM_RAW,
  CHARGE_SUBSCRIPTION_RAW,
  chargesListResponse,
} from "./fixtures.ts";

describe("parseChargeRecord", () => {
  it("extrai a venda avulsa parcelada com cliente, cartão e adquirente", () => {
    const charge = parseChargeRecord(CHARGE_LIST_ITEM_RAW);

    expect(charge).toMatchObject({
      chargeId: "ch_FIXTUREORDER001",
      orderId: "or_FIXTUREORDER001",
      invoiceId: null,
      subscriptionId: null,
      customerId: "cus_FIXTURECUSTOMER1",
      status: "paid",
      paymentMethod: "credit_card",
      installments: 12,
      amountCents: 116400,
      paidAmountCents: 116400,
      currency: "BRL",
      paidAt: "2026-08-12T12:44:12.000Z",
      cardBrand: "Mastercard",
      cardLastFour: "7793",
      acquirerName: "pagarme",
      recurrenceCycle: "first",
    });
    expect(charge?.customer).toMatchObject({
      customerId: "cus_FIXTURECUSTOMER1",
      name: "Cliente de Teste",
      email: "cliente.teste@example.com",
      documentType: "CPF",
    });
  });

  it("liga a cobrança à assinatura por invoice.subscriptionId (camelCase)", () => {
    const charge = parseChargeRecord(CHARGE_SUBSCRIPTION_RAW);

    expect(charge).toMatchObject({
      chargeId: "ch_FIXTURESUB0001",
      invoiceId: "in_FIXTUREINVOICE1",
      subscriptionId: "sub_FIXTURESUB00001",
      orderId: null, // cobrança de assinatura não tem order
      installments: 12,
      amountCents: 476400,
    });
  });

  it("aceita cobrança RECUSADA (necessária para taxa de aprovação)", () => {
    // o parser fiscal descarta tudo que não é 'paid'; este NÃO pode
    const charge = parseChargeRecord(CHARGE_FAILED_RAW);

    expect(charge).not.toBeNull();
    expect(charge).toMatchObject({
      chargeId: "ch_FIXTUREFAILED01",
      status: "failed",
      installments: 1,
      amountCents: 12700,
      paidAmountCents: null,
      paidAt: null,
    });
  });

  it("aceita valor zero e status ausente sem descartar a cobrança", () => {
    const charge = parseChargeRecord({ id: "ch_x", amount: 0 });

    expect(charge).toMatchObject({ chargeId: "ch_x", amountCents: 0, status: "unknown" });
  });

  it("descarta entrada sem id", () => {
    expect(parseChargeRecord({ amount: 100 })).toBeNull();
    expect(parseChargeRecord(null)).toBeNull();
    expect(parseChargeRecord("ch_texto")).toBeNull();
  });

  it("cai para last_transaction.paid_at quando a cobrança não traz paid_at", () => {
    const charge = parseChargeRecord({
      id: "ch_y",
      status: "paid",
      last_transaction: { paid_at: "2026-03-04T10:00:00Z" },
    });

    expect(charge?.paidAt).toBe("2026-03-04T10:00:00.000Z");
  });

  it("não inventa cliente quando não há id nem nome", () => {
    const charge = parseChargeRecord({ id: "ch_z", customer: { email: "x@y.z" } });

    expect(charge?.customer).toBeNull();
  });
});

describe("parseChargesListPage", () => {
  it("lê o envelope com total e next", () => {
    const page = parseChargesListPage(
      chargesListResponse([CHARGE_LIST_ITEM_RAW, CHARGE_FAILED_RAW], {
        total: 2076,
        next: "https://api.pagar.me/core/v5/charges?page=2&size=30",
      }),
    );

    expect(page.charges).toHaveLength(2);
    expect(page.count).toBe(2);
    expect(page.total).toBe(2076);
    expect(page.hasNext).toBe(true);
  });

  it("marca fim da paginação sem next", () => {
    const page = parseChargesListPage(chargesListResponse([CHARGE_LIST_ITEM_RAW]));

    expect(page.hasNext).toBe(false);
    expect(page.total).toBe(1);
  });

  it("página vazia sinaliza fim (count 0)", () => {
    const page = parseChargesListPage(chargesListResponse([]));

    expect(page.count).toBe(0);
    expect(page.charges).toEqual([]);
  });

  it("é defensivo com resposta inesperada", () => {
    expect(parseChargesListPage(null).charges).toEqual([]);
    expect(parseChargesListPage({}).charges).toEqual([]);
    expect(parseChargesListPage({ data: "nao-array" }).charges).toEqual([]);
    expect(parseChargesListPage({ data: [null, 1, "x"] }).charges).toEqual([]);
  });
});
