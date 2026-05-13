import type { CashflowPeriod, CashflowPeriodWithBalance } from "./types";

/**
 * Adds a running cumulative balance to each cashflow bucket.
 * Assumes buckets are already sorted by `bucket` (ISO date) ascending.
 */
export function withCumulativeBalance(
  periods: CashflowPeriod[],
  openingBalance = 0,
): CashflowPeriodWithBalance[] {
  let running = openingBalance;
  return periods.map((p) => {
    running += p.net;
    return { ...p, cumulative: running };
  });
}
