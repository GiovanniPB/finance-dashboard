import { describe, expect, it } from "vitest";

import { formatCurrencyInput, parseCurrencyInput } from "./currency";

describe("formatCurrencyInput", () => {
  it("formats positive values with thousand separator", () => {
    expect(formatCurrencyInput(1234.56)).toBe("1.234,56");
  });

  it("pads to two decimals", () => {
    expect(formatCurrencyInput(10)).toBe("10,00");
    expect(formatCurrencyInput(0.5)).toBe("0,50");
  });

  it("returns empty for nullish or NaN", () => {
    expect(formatCurrencyInput(null)).toBe("");
    expect(formatCurrencyInput(undefined)).toBe("");
    expect(formatCurrencyInput(Number.NaN)).toBe("");
  });

  it("formats large values", () => {
    expect(formatCurrencyInput(1_234_567.89)).toBe("1.234.567,89");
  });
});

describe("parseCurrencyInput", () => {
  it("treats digits as centavos and divides by 100", () => {
    expect(parseCurrencyInput("12345")).toBe(123.45);
    expect(parseCurrencyInput("1")).toBe(0.01);
  });

  it("ignores non-digit characters", () => {
    expect(parseCurrencyInput("1.234,56")).toBe(1234.56);
    expect(parseCurrencyInput("R$ 99,90")).toBe(99.9);
  });

  it("returns 0 for empty or invalid", () => {
    expect(parseCurrencyInput("")).toBe(0);
    expect(parseCurrencyInput("abc")).toBe(0);
  });

  it("round-trip preserves value through format/parse cycle", () => {
    const original = 1234.56;
    const formatted = formatCurrencyInput(original);
    expect(parseCurrencyInput(formatted)).toBe(original);
  });
});
