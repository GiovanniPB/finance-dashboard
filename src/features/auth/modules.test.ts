import { describe, expect, it } from "vitest";

import { canViewModule, DATA_MODULES } from "./modules";

describe("canViewModule", () => {
  it("super_admin vê qualquer módulo, mesmo com allow-list restrita", () => {
    for (const mod of DATA_MODULES) {
      expect(canViewModule(true, ["taxes"], mod)).toBe(true);
    }
  });

  it("visibleModules null = sem restrição (vê tudo)", () => {
    for (const mod of DATA_MODULES) {
      expect(canViewModule(false, null, mod)).toBe(true);
    }
  });

  it("allow-list restringe às escolhidas", () => {
    const allowed = canViewModule(false, ["financials", "taxes"], "financials");
    const denied = canViewModule(false, ["financials", "taxes"], "payroll");
    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });

  it("allow-list vazia esconde todos os módulos", () => {
    for (const mod of DATA_MODULES) {
      expect(canViewModule(false, [], mod)).toBe(false);
    }
  });
});
