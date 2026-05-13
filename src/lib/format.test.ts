import { describe, expect, it } from "vitest";

import { formatBRL, formatNumber, formatPercent, formatVariation } from "./format";

describe("formatBRL", () => {
  it("formats a positive number in BRL", () => {
    expect(formatBRL(1234.56)).toBe("R$ 1.234,56");
  });

  it("formats zero", () => {
    expect(formatBRL(0)).toBe("R$ 0,00");
  });

  it("returns em-dash for null/undefined/NaN", () => {
    expect(formatBRL(null)).toBe("—");
    expect(formatBRL(undefined)).toBe("—");
    expect(formatBRL("not a number")).toBe("—");
  });

  it("formats compact when requested", () => {
    expect(formatBRL(1_500_000, { compact: true })).toMatch(/mi/);
  });
});

describe("formatPercent", () => {
  it("formats fraction by default", () => {
    expect(formatPercent(0.123)).toBe("12,3%");
  });

  it("supports fromHundred for already-scaled inputs", () => {
    expect(formatPercent(12.3, { fromHundred: true })).toBe("12,3%");
  });
});

describe("formatNumber", () => {
  it("formats integers without decimals", () => {
    expect(formatNumber(1234)).toBe("1.234");
  });
});

describe("formatVariation", () => {
  it("returns positive tone with + sign", () => {
    const r = formatVariation(0.12);
    expect(r.text.startsWith("+")).toBe(true);
    expect(r.tone).toBe("positive");
  });

  it("returns negative tone without + sign", () => {
    const r = formatVariation(-0.05);
    expect(r.text.startsWith("-")).toBe(true);
    expect(r.tone).toBe("negative");
  });

  it("returns neutral for zero or nullish", () => {
    expect(formatVariation(0).tone).toBe("neutral");
    expect(formatVariation(null).tone).toBe("neutral");
  });
});
