import type { DreComputedRow, DreRow } from "./types";

/**
 * Computes the effective display totals for a single value basis.
 *
 * Two strategies are blended:
 *
 * 1. **Summary with children** (e.g. "(+) Venda Bruta" with sub-accounts):
 *    its total is the sum of its descendants' effective totals.
 *
 * 2. **Standalone summary** (e.g. "(=) Venda Líquida", "(=) Margem de
 *    Contribuição"): no children — running-balance markers whose total equals
 *    the running sum of preceding top-level rows (ignoring below-the-line).
 */
function computeBasis(
  sorted: DreRow[],
  childrenOf: Map<string, DreRow[]>,
  pick: (row: DreRow) => number,
): Map<string, number> {
  const totalsMap = new Map<string, number>();

  function effectiveTotal(row: DreRow): number {
    const cached = totalsMap.get(row.account_id);
    if (cached !== undefined) return cached;

    let total: number;
    if (!row.is_summary) {
      total = pick(row);
    } else {
      const children = childrenOf.get(row.account_id) ?? [];
      total = children.length > 0 ? children.reduce((sum, c) => sum + effectiveTotal(c), 0) : 0;
    }
    totalsMap.set(row.account_id, total);
    return total;
  }

  // Pre-fill summary-with-children + leaves.
  for (const r of sorted) {
    if (r.is_summary && (childrenOf.get(r.account_id) ?? []).length > 0) {
      effectiveTotal(r);
    } else if (!r.is_summary) {
      totalsMap.set(r.account_id, pick(r));
    }
  }

  // Running pass for standalone summaries (top-level, above-the-line only).
  let running = 0;
  for (const r of sorted) {
    if (r.below_the_line) continue;
    if (r.parent_id !== null) continue;

    const childCount = (childrenOf.get(r.account_id) ?? []).length;
    const isStandalone = r.is_summary && childCount === 0;

    if (isStandalone) {
      totalsMap.set(r.account_id, running);
    } else {
      running += totalsMap.get(r.account_id) ?? 0;
    }
  }

  return totalsMap;
}

/**
 * Computes display totals for a DRE on both the accrual basis (regime de
 * competência, by accrual_date → `effective_total`) and the cash basis (regime
 * de caixa, by cash_date → `effective_total_cash`).
 *
 * The chart is iterated in `sort_order`. Top-level (parent_id null) summaries
 * with children contribute their own total to the running sum; child rows are
 * not double-counted because they live under their summary parent.
 */
export function computeDreTotals(rows: DreRow[]): DreComputedRow[] {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const byId = new Map(sorted.map((r) => [r.account_id, r]));
  const childrenOf = new Map<string, DreRow[]>();
  for (const r of sorted) {
    if (r.parent_id) {
      const list = childrenOf.get(r.parent_id) ?? [];
      list.push(r);
      childrenOf.set(r.parent_id, list);
    }
  }

  const accrualTotals = computeBasis(sorted, childrenOf, (r) => r.total);
  const cashTotals = computeBasis(sorted, childrenOf, (r) => r.total_cash);

  // Depth computation by walking parent chain.
  function depth(row: DreRow): number {
    let d = 0;
    let cur: DreRow | undefined = row;
    while (cur?.parent_id) {
      cur = byId.get(cur.parent_id);
      if (!cur) break;
      d += 1;
    }
    return d;
  }

  return sorted.map((r) => ({
    ...r,
    effective_total: accrualTotals.get(r.account_id) ?? 0,
    effective_total_cash: cashTotals.get(r.account_id) ?? 0,
    depth: depth(r),
  }));
}
