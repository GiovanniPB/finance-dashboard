import { describe, expect, it } from "vitest";

import { baseContext, rawChargePaidWebhook } from "./fixtures.ts";
import { parseChargePaidWebhook } from "./parse.ts";
import { explodeChargePaid } from "./split.ts";

describe("parseChargePaidWebhook", () => {
  it("normaliza o envelope, lendo o split de last_transaction", () => {
    const event = parseChargePaidWebhook(rawChargePaidWebhook());

    expect(event).not.toBeNull();
    expect(event?.eventId).toBe("hook_test_0001");
    expect(event?.chargeId).toBe("ch_test_0001");
    expect(event?.amountCents).toBe(29900);
    expect(event?.planId).toBe("plan_assinatura_basica");
    expect(event?.customer.document).toBe("52998224725");
    expect(event?.customer.address?.city).toBe("Barueri");
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
