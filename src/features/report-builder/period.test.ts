import { describe, expect, it } from "vitest";

import { labelForRange, resolveComparison, resolvePeriod } from "./period";

/** 15 de julho de 2026 — referência fixa para os testes serem determinísticos. */
const REF = new Date(2026, 6, 15);

describe("resolvePeriod", () => {
  it("resolve o mês atual", () => {
    const result = resolvePeriod({ preset: "current_month" }, REF);

    expect(result.from).toBe("2026-07-01");
    expect(result.to).toBe("2026-07-31");
  });

  it("resolve o mês anterior", () => {
    const result = resolvePeriod({ preset: "last_month" }, REF);

    expect(result.from).toBe("2026-06-01");
    expect(result.to).toBe("2026-06-30");
  });

  it("resolve o trimestre atual", () => {
    const result = resolvePeriod({ preset: "current_quarter" }, REF);

    expect(result.from).toBe("2026-07-01");
    expect(result.to).toBe("2026-09-30");
    expect(result.label).toBe("3º trimestre de 2026");
  });

  it("resolve o trimestre anterior", () => {
    const result = resolvePeriod({ preset: "last_quarter" }, REF);

    expect(result.from).toBe("2026-04-01");
    expect(result.to).toBe("2026-06-30");
    expect(result.label).toBe("2º trimestre de 2026");
  });

  it("resolve o ano até a data de referência", () => {
    const result = resolvePeriod({ preset: "ytd" }, REF);

    expect(result.from).toBe("2026-01-01");
    expect(result.to).toBe("2026-07-15");
  });

  it("resolve os últimos 12 meses a partir do primeiro dia do mês", () => {
    const result = resolvePeriod({ preset: "last_12m" }, REF);

    expect(result.from).toBe("2025-08-01");
    expect(result.to).toBe("2026-07-15");
  });

  it("repassa as datas do preset custom", () => {
    const result = resolvePeriod({ preset: "custom", from: "2026-02-10", to: "2026-05-20" }, REF);

    expect(result.from).toBe("2026-02-10");
    expect(result.to).toBe("2026-05-20");
  });

  it("atravessa a virada de ano no mês anterior", () => {
    const result = resolvePeriod({ preset: "last_month" }, new Date(2026, 0, 10));

    expect(result.from).toBe("2025-12-01");
    expect(result.to).toBe("2025-12-31");
  });

  it("atravessa a virada de ano no trimestre anterior", () => {
    const result = resolvePeriod({ preset: "last_quarter" }, new Date(2026, 0, 10));

    expect(result.from).toBe("2025-10-01");
    expect(result.to).toBe("2025-12-31");
    expect(result.label).toBe("4º trimestre de 2025");
  });
});

describe("resolveComparison", () => {
  const july = { from: "2026-07-01", to: "2026-07-31", label: "jul" };

  it("retorna null sem comparativo", () => {
    expect(resolveComparison(july, "none")).toBeNull();
  });

  it("desloca um ano no YoY", () => {
    const result = resolveComparison(july, "yoy");

    expect(result?.from).toBe("2025-07-01");
    expect(result?.to).toBe("2025-07-31");
  });

  it("trunca 29/02 para o último dia de fevereiro no ano não bissexto", () => {
    const result = resolveComparison({ from: "2024-02-29", to: "2024-02-29", label: "" }, "yoy");

    expect(result?.from).toBe("2023-02-28");
    expect(result?.to).toBe("2023-02-28");
  });

  it("usa o mês civil anterior no MoM de um mês inteiro", () => {
    const result = resolveComparison(july, "mom");

    expect(result?.from).toBe("2026-06-01");
    expect(result?.to).toBe("2026-06-30");
  });

  it("desloca três meses civis no MoM de um trimestre", () => {
    const result = resolveComparison({ from: "2026-04-01", to: "2026-06-30", label: "" }, "mom");

    expect(result?.from).toBe("2026-01-01");
    expect(result?.to).toBe("2026-03-31");
  });

  it("atravessa a virada de ano no MoM", () => {
    const result = resolveComparison({ from: "2026-01-01", to: "2026-01-31", label: "" }, "mom");

    expect(result?.from).toBe("2025-12-01");
    expect(result?.to).toBe("2025-12-31");
  });

  it("desloca por dias quando o período não cobre meses inteiros", () => {
    const result = resolveComparison({ from: "2026-07-10", to: "2026-07-19", label: "" }, "mom");

    expect(result?.from).toBe("2026-06-30");
    expect(result?.to).toBe("2026-07-09");
  });
});

describe("labelForRange", () => {
  it("nomeia um mês inteiro pelo mês", () => {
    expect(labelForRange("2026-07-01", "2026-07-31")).toContain("2026");
    expect(labelForRange("2026-07-01", "2026-07-31")).not.toContain("→");
  });

  it("nomeia o ano civil completo pelo ano", () => {
    expect(labelForRange("2026-01-01", "2026-12-31")).toBe("2026");
  });

  it("usa intervalo de datas quando o período não é alinhado a mês", () => {
    expect(labelForRange("2026-07-10", "2026-08-05")).toBe("10/07/2026 → 05/08/2026");
  });

  it("usa intervalo de meses em vários meses inteiros", () => {
    expect(labelForRange("2026-04-01", "2026-06-30")).toContain("→");
  });
});
