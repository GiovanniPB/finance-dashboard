import { describe, expect, it } from "vitest";

import { DEFAULT_DUE_HORIZON, DUE_HORIZONS, dueLimitFor } from "./dueHorizon";

const TODAY = new Date(2026, 7, 12); // 12/08/2026

describe("dueLimitFor", () => {
  it("fecha no fim do mês corrente", () => {
    expect(dueLimitFor("month", TODAY)).toBe("2026-08-31");
  });

  it("fecha no fim do terceiro mês à frente", () => {
    expect(dueLimitFor("3m", TODAY)).toBe("2026-11-30");
  });

  it("fecha no fim do décimo segundo mês à frente", () => {
    expect(dueLimitFor("12m", TODAY)).toBe("2027-08-31");
  });

  it("não impõe teto quando o horizonte é aberto", () => {
    expect(dueLimitFor("all", TODAY)).toBeNull();
  });

  it("atravessa a virada de ano", () => {
    expect(dueLimitFor("3m", new Date(2026, 10, 15))).toBe("2027-02-28");
  });

  // O teto cai sempre no último dia do mês: um vencimento em 31/10 não pode
  // sumir só porque hoje é dia 12.
  it("não corta títulos do fim do mês-limite", () => {
    expect(dueLimitFor("month", new Date(2026, 9, 1))).toBe("2026-10-31");
  });

  it("cobre o padrão da tela", () => {
    expect(DUE_HORIZONS.some((h) => h.value === DEFAULT_DUE_HORIZON)).toBe(true);
    expect(dueLimitFor(DEFAULT_DUE_HORIZON, TODAY)).toBe("2026-11-30");
  });
});
