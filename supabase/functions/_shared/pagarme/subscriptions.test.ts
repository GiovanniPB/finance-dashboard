import { describe, expect, it } from "vitest";

import { SUBSCRIPTION_RAW } from "./fixtures.ts";
import {
  cycleMonths,
  parseSubscriptionRecord,
  parseSubscriptionsListPage,
} from "./subscriptions.ts";

describe("parseSubscriptionRecord", () => {
  it("normaliza a assinatura anual e deriva o MRR", () => {
    const sub = parseSubscriptionRecord(SUBSCRIPTION_RAW);

    expect(sub).toMatchObject({
      subscriptionId: "sub_FIXTURESUB00001",
      customerId: "cus_FIXTURECUSTOMER2",
      planId: "plan_FIXTUREPLAN0001",
      planName: "Completo Anual",
      status: "active",
      interval: "year",
      intervalCount: 1,
      billingType: "prepaid",
      installments: 12,
      startAt: "2026-08-12T00:00:00.000Z",
      nextBillingAt: "2027-08-12T00:00:00.000Z",
      canceledAt: null,
      currentCycleStart: "2026-08-12T00:00:00.000Z",
      currentCycleEnd: "2027-08-11T23:59:59.000Z",
      cycleAmountCents: 476400,
    });
  });

  it("o MRR da anual coincide com a parcela dos payables (os dois lados fecham)", () => {
    // ciclo de R$ 4.764,00 ÷ 12 meses = R$ 397,00 — exatamente o `amount` de
    // cada payable observado em produção para esta mesma venda
    expect(parseSubscriptionRecord(SUBSCRIPTION_RAW)?.mrr).toBe("397.00");
  });

  it("assinatura mensal tem MRR igual ao valor do ciclo", () => {
    const sub = parseSubscriptionRecord({
      ...SUBSCRIPTION_RAW,
      interval: "month",
      interval_count: 1,
      items: [{ quantity: 1, pricing_scheme: { price: 12700 } }],
    });

    expect(sub?.mrr).toBe("127.00");
  });

  it("multiplica pela quantidade e ignora item removido", () => {
    const sub = parseSubscriptionRecord({
      ...SUBSCRIPTION_RAW,
      interval: "month",
      interval_count: 1,
      items: [
        { quantity: 3, pricing_scheme: { price: 10000 } },
        { quantity: 1, status: "deleted", pricing_scheme: { price: 99900 } },
      ],
    });

    expect(sub?.cycleAmountCents).toBe(30000);
    expect(sub?.mrr).toBe("300.00");
  });

  it("captura o cancelamento quando existe", () => {
    const sub = parseSubscriptionRecord({
      ...SUBSCRIPTION_RAW,
      status: "canceled",
      canceled_at: "2026-09-01T14:00:00Z",
    });

    expect(sub?.status).toBe("canceled");
    expect(sub?.canceledAt).toBe("2026-09-01T14:00:00.000Z");
  });

  it("não inventa MRR sem preço ou sem intervalo conhecido", () => {
    expect(parseSubscriptionRecord({ ...SUBSCRIPTION_RAW, items: [] })?.mrr).toBeNull();
    expect(parseSubscriptionRecord({ ...SUBSCRIPTION_RAW, interval: "fortnight" })?.mrr).toBeNull();
  });

  it("descarta entrada sem id", () => {
    expect(parseSubscriptionRecord({ status: "active" })).toBeNull();
    expect(parseSubscriptionRecord(null)).toBeNull();
  });
});

describe("cycleMonths", () => {
  it("é exato para mês e ano", () => {
    expect(cycleMonths("month", 1)).toBe(1);
    expect(cycleMonths("month", 3)).toBe(3);
    expect(cycleMonths("year", 1)).toBe(12);
    expect(cycleMonths("year", 2)).toBe(24);
  });

  it("aproxima semana e dia pela média de dias por mês", () => {
    expect(cycleMonths("week", 4)).toBeCloseTo(0.92, 2);
    expect(cycleMonths("day", 30)).toBeCloseTo(0.99, 2);
  });

  it("assume ciclo unitário quando a contagem é ausente ou inválida", () => {
    expect(cycleMonths("month", null)).toBe(1);
    expect(cycleMonths("month", 0)).toBe(1);
  });

  it("devolve null para intervalo desconhecido", () => {
    expect(cycleMonths("decade", 1)).toBeNull();
    expect(cycleMonths(null, 1)).toBeNull();
  });
});

describe("parseSubscriptionsListPage", () => {
  it("lê o envelope da lista", () => {
    const page = parseSubscriptionsListPage({
      data: [SUBSCRIPTION_RAW],
      paging: { total: 144, next: "https://api.pagar.me/core/v5/subscriptions?page=2" },
    });

    expect(page.subscriptions).toHaveLength(1);
    expect(page.total).toBe(144);
    expect(page.hasNext).toBe(true);
  });

  it("página vazia é caso NORMAL (a conta da RCO não tem assinatura)", () => {
    const page = parseSubscriptionsListPage({ data: [], paging: {} });

    expect(page.subscriptions).toEqual([]);
    expect(page.count).toBe(0);
    expect(page.hasNext).toBe(false);
  });
});
