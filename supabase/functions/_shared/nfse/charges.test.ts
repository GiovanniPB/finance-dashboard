import { describe, expect, it } from "vitest";

import { parseChargesPage } from "./charges.ts";
import { chargesListPage } from "./fixtures.ts";

describe("parseChargesPage", () => {
  it("extrai só os ids das cobranças pagas e lê o paging.total", () => {
    const page = parseChargesPage(chargesListPage());

    expect(page.paidIds).toEqual(["ch_test_0001"]); // a 'pending' é ignorada
    expect(page.count).toBe(2); // itens brutos na página
    expect(page.total).toBe(2);
  });

  it("aceita array direto (sem envelope) e ignora itens sem id", () => {
    const page = parseChargesPage([
      { id: "ch_a", status: "paid" },
      { status: "paid" }, // sem id -> ignorado
      { id: "ch_b", status: "paid" },
    ]);
    expect(page.paidIds).toEqual(["ch_a", "ch_b"]);
    expect(page.total).toBeNull(); // sem paging
  });

  it("página vazia -> fim da paginação (count 0)", () => {
    const page = parseChargesPage({ data: [], paging: { total: 0 } });
    expect(page.paidIds).toEqual([]);
    expect(page.count).toBe(0);
    expect(page.total).toBe(0);
  });

  it("resposta inesperada -> vazio e seguro", () => {
    expect(parseChargesPage(null)).toEqual({ paidIds: [], count: 0, total: null });
    expect(parseChargesPage({})).toEqual({ paidIds: [], count: 0, total: null });
  });
});
