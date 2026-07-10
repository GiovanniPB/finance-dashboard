import { describe, expect, it } from "vitest";

import { availableColumnIds, DEFAULT_COLUMN_ORDER, resolveColumnOrder } from "./columns";

describe("availableColumnIds", () => {
  it("omits company outside consolidated scope", () => {
    const ids = availableColumnIds(false);
    expect(ids).not.toContain("company");
    expect(ids).toContain("counterparty");
  });

  it("includes company in consolidated scope", () => {
    expect(availableColumnIds(true)).toContain("company");
  });
});

describe("resolveColumnOrder", () => {
  const single = availableColumnIds(false);

  it("returns default order when nothing was saved", () => {
    expect(resolveColumnOrder([], single)).toEqual(single);
  });

  it("keeps the user's saved order", () => {
    const saved = ["amount", "description", "accrual_date"];
    const resolved = resolveColumnOrder(saved, single);
    expect(resolved.slice(0, 3)).toEqual(saved);
  });

  it("appends new columns (e.g. counterparty) at their default position for existing users", () => {
    // Preferência salva antes da coluna "counterparty" existir.
    const legacy = ["accrual_date", "cash_date", "description", "account", "status", "amount"];
    const resolved = resolveColumnOrder(legacy, single);
    expect(resolved).toContain("counterparty");
    expect(resolved).toHaveLength(single.length);
  });

  it("drops columns not available in the current scope", () => {
    const saved = ["company", "amount", "description"];
    const resolved = resolveColumnOrder(saved, single);
    expect(resolved).not.toContain("company");
  });

  it("surfaces company when the scope makes it available", () => {
    const consolidated = availableColumnIds(true);
    const resolved = resolveColumnOrder(["amount", "company"], consolidated);
    expect(resolved).toContain("company");
    expect(resolved).toHaveLength(consolidated.length);
  });

  it("never emits duplicates", () => {
    const resolved = resolveColumnOrder([...DEFAULT_COLUMN_ORDER, "amount"], single);
    expect(new Set(resolved).size).toBe(resolved.length);
  });
});
