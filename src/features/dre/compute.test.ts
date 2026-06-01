import { describe, expect, it } from "vitest";

import { computeDreTotals } from "./compute";
import type { DreRow } from "./types";

function row(partial: Partial<DreRow>): DreRow {
  return {
    account_id: partial.account_id ?? "",
    parent_id: partial.parent_id ?? null,
    code: partial.code ?? "",
    name: partial.name ?? "",
    kind: partial.kind ?? "revenue",
    dre_section: partial.dre_section ?? null,
    is_summary: partial.is_summary ?? false,
    below_the_line: partial.below_the_line ?? false,
    sign_hint: partial.sign_hint ?? null,
    sort_order: partial.sort_order ?? 0,
    total: partial.total ?? 0,
    total_cash: partial.total_cash ?? 0,
  };
}

describe("computeDreTotals", () => {
  it("sums children into summary with children", () => {
    const out = computeDreTotals([
      row({ account_id: "1", code: "1", is_summary: true, sort_order: 100 }),
      row({
        account_id: "1.01",
        parent_id: "1",
        code: "1.01",
        sort_order: 110,
        total: 100,
        kind: "revenue",
      }),
      row({
        account_id: "1.02",
        parent_id: "1",
        code: "1.02",
        sort_order: 120,
        total: 200,
        kind: "revenue",
      }),
    ]);
    const summary = out.find((r) => r.account_id === "1")!;
    expect(summary.effective_total).toBe(300);
  });

  it("computes standalone summary as running sum of preceding top-level rows", () => {
    // Mimics the real spreadsheet flow:
    //   (+) Venda Bruta with leaf 1.01=1000
    //   (-) Deduções with leaf 2.01=-200
    //   (=) Venda Líquida (standalone summary)
    const out = computeDreTotals([
      row({ account_id: "1", code: "1", is_summary: true, sort_order: 100 }),
      row({ account_id: "1.01", parent_id: "1", code: "1.01", sort_order: 110, total: 1000 }),
      row({ account_id: "2", code: "2", is_summary: true, sort_order: 200 }),
      row({
        account_id: "2.01",
        parent_id: "2",
        code: "2.01",
        sort_order: 210,
        total: -200,
        kind: "revenue_deduction",
      }),
      row({ account_id: "3", code: "3", is_summary: true, sort_order: 300 }),
    ]);
    expect(out.find((r) => r.account_id === "3")!.effective_total).toBe(800);
  });

  it("accumulates correctly across full spreadsheet-like structure", () => {
    // Venda Bruta 1000 - Imposto 100 = Líquida 900 - CMV 300 = Margem 600 - Despesas 100 = 500
    const out = computeDreTotals([
      row({ account_id: "1", code: "1", is_summary: true, sort_order: 100 }),
      row({ account_id: "1.01", parent_id: "1", code: "1.01", sort_order: 110, total: 1000 }),
      row({ account_id: "2", code: "2", is_summary: true, sort_order: 200 }),
      row({
        account_id: "2.01",
        parent_id: "2",
        code: "2.01",
        sort_order: 210,
        total: -100,
        kind: "revenue_deduction",
      }),
      row({ account_id: "3", code: "3", is_summary: true, sort_order: 300 }),
      row({ account_id: "4", code: "4", is_summary: true, sort_order: 400 }),
      row({
        account_id: "4.01",
        parent_id: "4",
        code: "4.01",
        sort_order: 410,
        total: -300,
        kind: "cogs",
      }),
      row({ account_id: "5", code: "5", is_summary: true, sort_order: 500 }),
      row({ account_id: "6", code: "6", is_summary: true, sort_order: 600 }),
      row({
        account_id: "6.01",
        parent_id: "6",
        code: "6.01",
        sort_order: 610,
        total: -100,
        kind: "operating_expense",
      }),
      row({ account_id: "7", code: "7", is_summary: true, sort_order: 700 }),
      row({ account_id: "8", code: "8", is_summary: true, sort_order: 800 }),
    ]);
    expect(out.find((r) => r.code === "3")!.effective_total).toBe(900);
    expect(out.find((r) => r.code === "5")!.effective_total).toBe(600);
    expect(out.find((r) => r.code === "8")!.effective_total).toBe(500);
  });

  it("excludes below_the_line rows from running sum", () => {
    const out = computeDreTotals([
      row({ account_id: "1", code: "1", is_summary: true, sort_order: 100 }),
      row({ account_id: "1.01", parent_id: "1", code: "1.01", sort_order: 110, total: 1000 }),
      row({
        account_id: "9.01",
        code: "9.01",
        sort_order: 900,
        total: -500,
        kind: "dividend",
        below_the_line: true,
      }),
      row({
        account_id: "9.05",
        code: "9.05",
        is_summary: true,
        sort_order: 940,
        below_the_line: true,
      }),
      row({ account_id: "8", code: "8", is_summary: true, sort_order: 800 }),
    ]);
    // 8 = result above-the-line only = 1000 (dividend not counted)
    expect(out.find((r) => r.code === "8")!.effective_total).toBe(1000);
  });

  it("computes accrual and cash bases independently", () => {
    const out = computeDreTotals([
      row({ account_id: "1", code: "1", is_summary: true, sort_order: 100 }),
      row({
        account_id: "1.01",
        parent_id: "1",
        code: "1.01",
        sort_order: 110,
        total: 1000,
        total_cash: 600,
      }),
      row({ account_id: "8", code: "8", is_summary: true, sort_order: 800 }),
    ]);
    const summary = out.find((r) => r.account_id === "1")!;
    expect(summary.effective_total).toBe(1000);
    expect(summary.effective_total_cash).toBe(600);
    // Standalone running totalizer reflects each basis.
    const totalizer = out.find((r) => r.code === "8")!;
    expect(totalizer.effective_total).toBe(1000);
    expect(totalizer.effective_total_cash).toBe(600);
  });

  it("computes depth from parent chain", () => {
    const out = computeDreTotals([
      row({ account_id: "6", code: "6", is_summary: true, sort_order: 600 }),
      row({
        account_id: "6.1",
        parent_id: "6",
        code: "6.1",
        is_summary: true,
        sort_order: 610,
      }),
      row({
        account_id: "6.1.01",
        parent_id: "6.1",
        code: "6.1.01",
        sort_order: 611,
        total: 50,
      }),
    ]);
    expect(out.find((r) => r.code === "6")!.depth).toBe(0);
    expect(out.find((r) => r.code === "6.1")!.depth).toBe(1);
    expect(out.find((r) => r.code === "6.1.01")!.depth).toBe(2);
  });
});
