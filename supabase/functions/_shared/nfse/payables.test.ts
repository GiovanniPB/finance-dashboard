import { describe, expect, it } from "vitest";

import { parsePayables } from "./payables.ts";

describe("parsePayables", () => {
  it("soma créditos por recebedor e calcula o total", () => {
    const r = parsePayables({
      data: [
        { type: "credit", amount: 17940, recipient_id: "re_a" },
        { type: "credit", amount: 11960, recipient_id: "re_b" },
      ],
    });

    expect(r.split).toEqual([
      { recipientId: "re_a", amount: 17940, type: "flat" },
      { recipientId: "re_b", amount: 11960, type: "flat" },
    ]);
    expect(r.totalCents).toBe(29900);
  });

  it("subtrai estorno/chargeback do crédito do recebedor", () => {
    const r = parsePayables({
      data: [
        { type: "credit", amount: 20000, recipient_id: "re_a" },
        { type: "refund", amount: 5000, recipient_id: "re_a" },
        { type: "credit", amount: 10000, recipient_id: "re_b" },
        { type: "chargeback", amount: 10000, recipient_id: "re_b" },
      ],
    });

    // re_a: 20000 - 5000 = 15000 (positivo, fica); re_b: 10000 - 10000 = 0 (some)
    expect(r.split).toEqual([{ recipientId: "re_a", amount: 15000, type: "flat" }]);
    expect(r.totalCents).toBe(15000);
  });

  it("aceita recebedor aninhado (recipient.id) e ignora itens sem recebedor", () => {
    const r = parsePayables({
      data: [
        { type: "credit", amount: 5000, recipient: { id: "re_x" } },
        { type: "credit", amount: 1000 }, // sem recebedor -> ignorado
      ],
    });
    expect(r.split).toEqual([{ recipientId: "re_x", amount: 5000, type: "flat" }]);
  });

  it("retorna vazio para resposta inesperada", () => {
    expect(parsePayables(null)).toEqual({ split: [], totalCents: 0 });
    expect(parsePayables({})).toEqual({ split: [], totalCents: 0 });
  });
});
