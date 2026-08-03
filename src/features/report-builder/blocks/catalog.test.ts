import { describe, expect, it } from "vitest";

import { BLOCK_TYPES } from "../schema";
import {
  allBlockDefinitions,
  availableBlockDefinitions,
  BLOCK_CATALOG,
  blockAvailability,
  blockDefinitionsByGroup,
  createBlock,
  getBlockDefinition,
} from "./catalog";

describe("BLOCK_CATALOG", () => {
  it("cobre todos os tipos declarados no schema", () => {
    for (const type of BLOCK_TYPES) {
      expect(BLOCK_CATALOG[type]).toBeDefined();
      expect(BLOCK_CATALOG[type].type).toBe(type);
    }
    expect(allBlockDefinitions()).toHaveLength(BLOCK_TYPES.length);
  });

  it("declara ao menos um escopo por bloco", () => {
    for (const def of allBlockDefinitions()) {
      expect(def.scopes.length).toBeGreaterThan(0);
    }
  });

  it("mantém altura estimada não negativa", () => {
    for (const def of allBlockDefinitions()) {
      expect(def.estimatedHeightMm).toBeGreaterThanOrEqual(0);
    }
  });

  it("só oferece defaults para opções que o bloco honra", () => {
    for (const def of allBlockDefinitions()) {
      for (const key of Object.keys(def.defaults ?? {})) {
        expect(def.options ?? []).toContain(key);
      }
    }
  });

  it("agrupa sem perder blocos", () => {
    const grouped = (
      ["estrutura", "indicadores", "graficos", "demonstrativos", "analises"] as const
    )
      .flatMap((group) => blockDefinitionsByGroup(group))
      .map((def) => def.type);

    expect(grouped).toHaveLength(BLOCK_TYPES.length);
  });
});

describe("blockAvailability", () => {
  it("libera DRE nos dois escopos", () => {
    expect(blockAvailability("dre", { mode: "company", comparison: "none" }).available).toBe(true);
    expect(blockAvailability("dre", { mode: "consolidated", comparison: "none" }).available).toBe(
      true,
    );
  });

  it("bloqueia fluxo de caixa no consolidado com motivo", () => {
    const result = blockAvailability("cashflow", { mode: "consolidated", comparison: "none" });

    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/consolidada/iu);
  });

  it("bloqueia os demais blocos por empresa no consolidado", () => {
    for (const type of [
      "bank-balances",
      "cost-centers",
      "counterparties",
      "forecast",
      "dre-comparison",
    ] as const) {
      expect(blockAvailability(type, { mode: "consolidated", comparison: "yoy" }).available).toBe(
        false,
      );
    }
  });

  it("exige comparativo no DRE comparativo", () => {
    const withoutComparison = blockAvailability("dre-comparison", {
      mode: "company",
      comparison: "none",
    });
    const withComparison = blockAvailability("dre-comparison", {
      mode: "company",
      comparison: "mom",
    });

    expect(withoutComparison.available).toBe(false);
    expect(withoutComparison.reason).toMatch(/compara/iu);
    expect(withComparison.available).toBe(true);
  });

  it("não exige comparativo nos gráficos ano vs. ano (comparam por natureza)", () => {
    expect(
      blockAvailability("revenue-yoy-chart", { mode: "consolidated", comparison: "none" })
        .available,
    ).toBe(true);
  });
});

describe("availableBlockDefinitions", () => {
  it("oferece menos blocos no consolidado do que por empresa", () => {
    const company = availableBlockDefinitions({ mode: "company", comparison: "yoy" });
    const consolidated = availableBlockDefinitions({ mode: "consolidated", comparison: "yoy" });

    expect(consolidated.length).toBeLessThan(company.length);
  });

  it("nunca inclui bloco indisponível", () => {
    const context = { mode: "consolidated", comparison: "none" } as const;

    for (const def of availableBlockDefinitions(context)) {
      expect(blockAvailability(def.type, context).available).toBe(true);
    }
  });
});

describe("createBlock", () => {
  it("aplica os defaults do catálogo", () => {
    const block = createBlock("counterparties", "fixo-1");

    expect(block.instanceId).toBe("fixo-1");
    expect(block.type).toBe("counterparties");
    expect(block.options.topN).toBe(15);
    expect(block.options.counterpartyKind).toBe("all");
  });

  it("cria opções vazias para bloco sem defaults", () => {
    expect(createBlock("page-break", "fixo-2").options).toEqual({});
  });

  it("não compartilha o objeto de defaults entre instâncias", () => {
    const a = createBlock("cashflow", "a");
    const b = createBlock("cashflow", "b");
    a.options.granularity = "daily";

    expect(b.options.granularity).toBe("monthly");
    expect(getBlockDefinition("cashflow").defaults?.granularity).toBe("monthly");
  });

  it("gera instanceId único quando não informado", () => {
    expect(createBlock("dre").instanceId).not.toBe(createBlock("dre").instanceId);
  });
});
