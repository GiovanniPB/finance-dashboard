import { describe, expect, it } from "vitest";

import { toCents } from "@/lib/money";

import { baseContext, baseEvent, IDS } from "./fixtures";
import { allocateShares, explodeChargePaid, resolveTomador } from "./split";
import type { PagarmeSplit } from "./types";

describe("allocateShares", () => {
  it("divide um split percentual preservando a soma exata", () => {
    const split: PagarmeSplit[] = [
      { recipientId: "a", amount: 60, type: "percentage" },
      { recipientId: "b", amount: 40, type: "percentage" },
    ];
    const shares = allocateShares(29900, split);

    expect(shares).toEqual([17940, 11960]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(29900);
  });

  it("distribui o resto de arredondamento mantendo a soma (split 3x 33,33%)", () => {
    const split: PagarmeSplit[] = [
      { recipientId: "a", amount: 33.34, type: "percentage" },
      { recipientId: "b", amount: 33.33, type: "percentage" },
      { recipientId: "c", amount: 33.33, type: "percentage" },
    ];
    const shares = allocateShares(10000, split);

    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000); // sem perder/inventar centavos
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
  });

  it("suporta split flat (valores absolutos em centavos)", () => {
    const split: PagarmeSplit[] = [
      { recipientId: "a", amount: 20000, type: "flat" },
      { recipientId: "b", amount: 9900, type: "flat" },
    ];
    const shares = allocateShares(29900, split);

    expect(shares).toEqual([20000, 9900]);
  });
});

describe("resolveTomador", () => {
  it("marca como válido quando documento e endereço estão completos", () => {
    const t = resolveTomador(baseEvent().customer);
    expect(t.valid).toBe(true);
    expect(t.warnings).toEqual([]);
  });

  it("acusa documento inválido e endereço incompleto", () => {
    const t = resolveTomador({ name: "X", document: "111", address: null });
    expect(t.valid).toBe(false);
    expect(t.warnings).toContain("tomador_documento_invalido");
    expect(t.warnings).toContain("tomador_endereco_incompleto");
  });
});

describe("explodeChargePaid", () => {
  it("explode em um job por recebedor, com fatias que somam o total", () => {
    const { jobs, skipped } = explodeChargePaid(baseEvent(), baseContext());

    expect(skipped).toEqual([]);
    expect(jobs).toHaveLength(2);

    const somaCents = jobs.reduce((acc, j) => acc + toCents(j.valorServicos), 0);
    expect(somaCents).toBe(29900); // invariante: soma das fatias = total da cobrança

    const a = jobs.find((j) => j.pagarmeRecipientId === "rp_company_a");
    const b = jobs.find((j) => j.pagarmeRecipientId === "rp_company_b");
    expect(a?.valorServicos).toBe(179.4);
    expect(b?.valorServicos).toBe(119.6);
  });

  it("resolve classificação fiscal por plano e cai no padrão da empresa", () => {
    const { jobs } = explodeChargePaid(baseEvent(), baseContext());
    const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);
    const b = jobs.find((j) => j.companyId === IDS.COMPANY_B);

    expect(a?.itemListaServico).toBe("17.01"); // match por plano
    expect(b?.itemListaServico).toBe("10.02"); // padrão da empresa (sem plano)
  });

  it("define status inicial pelo emission_mode (automatic -> queued, manual -> pending_review)", () => {
    const { jobs } = explodeChargePaid(baseEvent(), baseContext());
    const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);
    const b = jobs.find((j) => j.companyId === IDS.COMPANY_B);

    expect(a?.status).toBe("queued"); // empresa A: automatic
    expect(b?.status).toBe("pending_review"); // empresa B: manual
  });

  it("força revisão manual quando o kill-switch (enabled=false) está ativo", () => {
    const ctx = baseContext();
    ctx.settings[0] = { ...ctx.settings[0], enabled: false };
    const { jobs } = explodeChargePaid(baseEvent(), ctx);
    const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);

    expect(a?.status).toBe("pending_review");
  });

  it("força revisão manual e registra warnings quando o tomador é inválido", () => {
    const event = baseEvent();
    event.customer = { name: "Sem Doc", document: null, address: null };
    const { jobs } = explodeChargePaid(event, baseContext());

    // empresa A é automatic, mas tomador inválido -> não vai para a fila
    const a = jobs.find((j) => j.companyId === IDS.COMPANY_A);
    expect(a?.status).toBe("pending_review");
    expect((a?.metadata as { validationWarnings?: string[] }).validationWarnings).toContain(
      "tomador_documento_invalido",
    );
  });

  it("pula recebedores não mapeados a uma empresa", () => {
    const event = baseEvent();
    event.split = [
      { recipientId: "rp_company_a", amount: 50, type: "percentage" },
      { recipientId: "rp_desconhecido", amount: 50, type: "percentage" },
    ];
    const { jobs, skipped } = explodeChargePaid(event, baseContext());

    expect(jobs).toHaveLength(1);
    expect(skipped).toEqual([{ recipientId: "rp_desconhecido", reason: "recipient_not_mapped" }]);
  });

  it("é determinístico (mesma entrada -> mesma saída) — suporta idempotência", () => {
    const r1 = explodeChargePaid(baseEvent(), baseContext());
    const r2 = explodeChargePaid(baseEvent(), baseContext());
    expect(r1).toEqual(r2);
  });
});
