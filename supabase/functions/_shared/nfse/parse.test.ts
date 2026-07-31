import { describe, expect, it } from "vitest";

import { baseContext, rawChargeDetail, rawChargePaidWebhook } from "./fixtures.ts";
import { pagarmeTimestamp, parseChargePaidWebhook, parseChargeResource } from "./parse.ts";
import { explodeChargePaid } from "./split.ts";

describe("pagarmeTimestamp", () => {
  it("assume UTC quando a data vem sem sufixo de fuso (o caso real)", () => {
    expect(pagarmeTimestamp("2026-07-31T14:32:54")).toBe("2026-07-31T14:32:54.000Z");
  });

  it("respeita o fuso quando ele vem declarado", () => {
    expect(pagarmeTimestamp("2026-06-03T12:00:00Z")).toBe("2026-06-03T12:00:00.000Z");
    expect(pagarmeTimestamp("2026-06-03T12:00:00-03:00")).toBe("2026-06-03T15:00:00.000Z");
  });

  it("devolve null para ausente, vazio ou inválido", () => {
    expect(pagarmeTimestamp(null)).toBeNull();
    expect(pagarmeTimestamp("")).toBeNull();
    expect(pagarmeTimestamp(12345)).toBeNull();
    expect(pagarmeTimestamp("ontem")).toBeNull();
  });
});

describe("parseChargePaidWebhook", () => {
  it("normaliza o envelope, lendo o split de last_transaction", () => {
    const event = parseChargePaidWebhook(rawChargePaidWebhook());

    expect(event).not.toBeNull();
    expect(event?.eventId).toBe("hook_test_0001");
    expect(event?.chargeId).toBe("ch_test_0001");
    expect(event?.amountCents).toBe(29900);
    expect(event?.planId).toBeNull(); // não vem no charge.paid
    expect(event?.subscriptionId).toBe("sub_test_0001"); // de data.invoice.subscriptionId
    expect(event?.customer.document).toBe("52998224725");
    expect(event?.customer.address?.city).toBe("Barueri");
    // datas da cobrança: compra e pagamento, normalizadas para UTC
    expect(event?.chargeCreatedAt).toBe("2026-06-03T11:59:58.000Z");
    expect(event?.paidAt).toBe("2026-06-03T12:00:00.000Z");
    // recebedor extraído de split[].recipient.id (objeto aninhado)
    expect(event?.split).toEqual([
      { recipientId: "rp_company_a", amount: 60, type: "percentage" },
      { recipientId: "rp_company_b", amount: 40, type: "percentage" },
    ]);
  });

  it("também aceita split em data.split (fallback)", () => {
    const raw = rawChargePaidWebhook();
    const data = raw.data as Record<string, unknown>;
    data.split = (data.last_transaction as Record<string, unknown>).split;
    delete data.last_transaction;

    const event = parseChargePaidWebhook(raw);
    expect(event?.split).toHaveLength(2);
  });

  it("retorna null para tipo diferente de charge.paid", () => {
    const raw = rawChargePaidWebhook();
    raw.type = "charge.pending";
    expect(parseChargePaidWebhook(raw)).toBeNull();
  });

  it("retorna null sem id da cobrança ou com valor zero", () => {
    const noId = rawChargePaidWebhook();
    (noId.data as Record<string, unknown>).id = "";
    expect(parseChargePaidWebhook(noId)).toBeNull();

    const zero = rawChargePaidWebhook();
    (zero.data as Record<string, unknown>).amount = 0;
    expect(parseChargePaidWebhook(zero)).toBeNull();
  });

  it("integra com a explosão: payload bruto -> 2 jobs somando o total", () => {
    const event = parseChargePaidWebhook(rawChargePaidWebhook());
    expect(event).not.toBeNull();

    const { jobs } = explodeChargePaid(event!, baseContext());
    expect(jobs).toHaveLength(2);
    expect(jobs[0].valorServicos + jobs[1].valorServicos).toBeCloseTo(299.0, 2);
  });
});

describe("parseChargeResource (backfill — detalhe de GET /charges/{id})", () => {
  it("mapeia o detalhe igual ao webhook, com eventId de procedência", () => {
    const event = parseChargeResource(rawChargeDetail(), "backfill:ch_test_0001");

    expect(event).not.toBeNull();
    expect(event?.eventId).toBe("backfill:ch_test_0001");
    expect(event?.chargeId).toBe("ch_test_0001");
    expect(event?.amountCents).toBe(29900);
    expect(event?.subscriptionId).toBe("sub_test_0001");
    expect(event?.customer.address?.city).toBe("Barueri"); // presente só no detalhe
    expect(event?.split).toEqual([
      { recipientId: "rp_company_a", amount: 60, type: "percentage" },
      { recipientId: "rp_company_b", amount: 40, type: "percentage" },
    ]);
  });

  it("cai no paid_at da transação quando a cobrança não o traz", () => {
    const charge = rawChargeDetail();
    delete charge.paid_at;
    (charge.last_transaction as Record<string, unknown>).paid_at = "2026-06-03T12:00:05";

    const event = parseChargeResource(charge, "backfill:x");
    expect(event?.paidAt).toBe("2026-06-03T12:00:05.000Z");
  });

  it("deixa paidAt null quando nenhuma forma traz a data (não inventa data)", () => {
    const charge = rawChargeDetail();
    delete charge.paid_at;

    const event = parseChargeResource(charge, "backfill:x");
    expect(event?.paidAt).toBeNull();
    expect(event?.chargeCreatedAt).toBe("2026-06-03T11:59:58.000Z");
  });

  it("produz o MESMO evento que o webhook (fora eventId) — fonte única", () => {
    const fromWebhook = parseChargePaidWebhook(rawChargePaidWebhook());
    const fromResource = parseChargeResource(rawChargeDetail(), fromWebhook!.eventId);
    expect(fromResource).toEqual(fromWebhook);
  });

  it("ignora cobrança não-paga (rede de segurança)", () => {
    const pending = rawChargeDetail();
    pending.status = "pending";
    expect(parseChargeResource(pending, "backfill:x")).toBeNull();
  });

  it("null sem eventId ou sem id/valor da cobrança", () => {
    expect(parseChargeResource(rawChargeDetail(), "")).toBeNull();

    const noAmount = rawChargeDetail();
    noAmount.amount = 0;
    expect(parseChargeResource(noAmount, "backfill:x")).toBeNull();
  });

  it("integra com a explosão: detalhe -> 2 jobs somando o total", () => {
    const event = parseChargeResource(rawChargeDetail(), "backfill:ch_test_0001");
    const { jobs } = explodeChargePaid(event!, baseContext());
    expect(jobs).toHaveLength(2);
    expect(jobs[0].valorServicos + jobs[1].valorServicos).toBeCloseTo(299.0, 2);
  });
});
