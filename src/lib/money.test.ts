import { describe, expect, it } from "vitest";

import { addCents, fromCents, signed, subCents, toCents } from "./money";

describe("money helpers", () => {
  it("toCents handles floats safely", () => {
    expect(toCents(0.1)).toBe(10);
    expect(toCents(0.2)).toBe(20);
    expect(toCents("1.99")).toBe(199);
  });

  it("addCents avoids floating point drift", () => {
    expect(addCents(0.1, 0.2)).toBe(0.3);
    expect(addCents(1.1, 2.2, 3.3)).toBe(6.6);
  });

  it("subCents works without precision loss", () => {
    expect(subCents(1, 0.9)).toBe(0.1);
  });

  it("fromCents reverses toCents", () => {
    expect(fromCents(toCents(99.95))).toBe(99.95);
  });

  it("signed flips outflow", () => {
    expect(signed(100, "inflow")).toBe(100);
    expect(signed(100, "outflow")).toBe(-100);
  });
});
