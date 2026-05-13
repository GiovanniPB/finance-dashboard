import { describe, expect, it } from "vitest";

import { withCumulativeBalance } from "./compute";
import type { CashflowPeriod } from "./types";

const period = (bucket: string, net: number): CashflowPeriod => ({
  bucket,
  inflow: net > 0 ? net : 0,
  outflow: net < 0 ? -net : 0,
  net,
});

describe("withCumulativeBalance", () => {
  it("accumulates net flows from zero by default", () => {
    const result = withCumulativeBalance([
      period("2025-01-15", 100),
      period("2025-02-15", -30),
      period("2025-03-15", 50),
    ]);
    expect(result.map((r) => r.cumulative)).toEqual([100, 70, 120]);
  });

  it("respects opening balance", () => {
    const result = withCumulativeBalance(
      [period("2025-01-15", 100), period("2025-02-15", -30)],
      1000,
    );
    expect(result.map((r) => r.cumulative)).toEqual([1100, 1070]);
  });

  it("handles empty list", () => {
    expect(withCumulativeBalance([], 500)).toEqual([]);
  });

  it("preserves other fields", () => {
    const result = withCumulativeBalance([period("2025-01-15", 100)]);
    expect(result[0]).toMatchObject({
      bucket: "2025-01-15",
      inflow: 100,
      outflow: 0,
      net: 100,
      cumulative: 100,
    });
  });
});
