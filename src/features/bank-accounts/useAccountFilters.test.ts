import { describe, expect, it } from "vitest";

import { periodPresets } from "./useAccountFilters";

describe("periodPresets", () => {
  // 15/07/2026 — mês com 31 dias, precedido por junho com 30.
  const reference = new Date(2026, 6, 15);

  it("cobre o mês corrente inteiro", () => {
    const [thisMonth] = periodPresets(reference);
    expect(thisMonth.label).toBe("Este mês");
    expect(thisMonth.from).toBe("2026-07-01");
    expect(thisMonth.to).toBe("2026-07-31");
  });

  it("cobre o mês anterior inteiro", () => {
    const lastMonth = periodPresets(reference)[1];
    expect(lastMonth.from).toBe("2026-06-01");
    expect(lastMonth.to).toBe("2026-06-30");
  });

  it("usa 90 dias inclusivos para o preset de 90 dias", () => {
    const last90 = periodPresets(reference)[2];
    expect(last90.to).toBe("2026-07-15");
    const days =
      (new Date(`${last90.to}T00:00:00`).getTime() -
        new Date(`${last90.from}T00:00:00`).getTime()) /
      86_400_000;
    expect(days).toBe(89);
  });

  it("cobre o ano corrente inteiro", () => {
    const thisYear = periodPresets(reference)[3];
    expect(thisYear.from).toBe("2026-01-01");
    expect(thisYear.to).toBe("2026-12-31");
  });

  it("vira o ano corretamente quando a referência é janeiro", () => {
    const january = periodPresets(new Date(2026, 0, 10));
    expect(january[0].from).toBe("2026-01-01");
    expect(january[1].from).toBe("2025-12-01");
    expect(january[1].to).toBe("2025-12-31");
  });
});
