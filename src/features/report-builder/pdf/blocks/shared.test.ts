import { describe, expect, it } from "vitest";

import { formatOutflow, isNegativeValue } from "./shared";

describe("formatOutflow", () => {
  it("põe sinal negativo em valor positivo de saída", () => {
    expect(formatOutflow(1_200)).toMatch(/^-R\$/u);
  });

  it("mantém o sinal negativo de valor já negativo", () => {
    expect(formatOutflow(-1_200)).toMatch(/^-R\$/u);
  });

  it("não produz menos-zero", () => {
    // -Math.abs(0) é -0, que o Intl imprime como "-R$ 0,00".
    expect(formatOutflow(0)).not.toContain("-");
  });

  it("trata valor não finito como zero", () => {
    expect(formatOutflow(Number.NaN)).not.toContain("-");
  });
});

describe("isNegativeValue", () => {
  it("reconhece negativo", () => {
    expect(isNegativeValue(-1)).toBe(true);
  });

  it("não considera zero como negativo", () => {
    expect(isNegativeValue(0)).toBe(false);
    expect(isNegativeValue(-0)).toBe(false);
  });

  it("rejeita ausente e não finito", () => {
    expect(isNegativeValue(null)).toBe(false);
    expect(isNegativeValue(undefined)).toBe(false);
    expect(isNegativeValue(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});
