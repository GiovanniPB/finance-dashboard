import { describe, expect, it } from "vitest";

import { dayEndIso, dayStartIso } from "./dates";

describe("dayStartIso / dayEndIso", () => {
  it("ancora o início do dia na meia-noite local", () => {
    const start = new Date(dayStartIso("2026-07-31"));
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 6, 31]);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("ancora o fim do dia no último milissegundo local", () => {
    const end = new Date(dayEndIso("2026-07-31"));
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 6, 31]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("gera uma janela de um dia exato", () => {
    const ms =
      new Date(dayEndIso("2026-07-31")).getTime() - new Date(dayStartIso("2026-07-31")).getTime();
    expect(ms).toBe(86_400_000 - 1);
  });
});
