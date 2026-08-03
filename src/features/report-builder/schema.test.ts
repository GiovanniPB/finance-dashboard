import { describe, expect, it } from "vitest";

import {
  emptyReportConfig,
  parseReportConfig,
  REPORT_CONFIG_VERSION,
  reportBlockSchema,
  reportConfigSchema,
  reportPeriodSchema,
  reportScopeSchema,
} from "./schema";

const ORG = "00000000-0000-0000-0000-000000000001";
const COMPANY = "11111111-1111-1111-1111-111111111111";

function validConfig() {
  return {
    scope: { mode: "company", companyId: COMPANY, organizationId: ORG },
    period: { preset: "last_month" },
    document: { title: "Relatório Mensal" },
    blocks: [{ instanceId: "a", type: "dre", options: {} }],
  };
}

describe("reportScopeSchema", () => {
  it("aceita escopo consolidado sem empresa", () => {
    const result = reportScopeSchema.safeParse({
      mode: "consolidated",
      companyId: null,
      organizationId: ORG,
    });

    expect(result.success).toBe(true);
  });

  it("rejeita escopo de empresa sem companyId", () => {
    const result = reportScopeSchema.safeParse({
      mode: "company",
      companyId: null,
      organizationId: ORG,
    });

    expect(result.success).toBe(false);
  });

  it("assume companyId nulo quando omitido", () => {
    const result = reportScopeSchema.safeParse({ mode: "consolidated", organizationId: ORG });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.companyId).toBeNull();
  });
});

describe("reportPeriodSchema", () => {
  it("aceita preset sem datas", () => {
    expect(reportPeriodSchema.safeParse({ preset: "ytd" }).success).toBe(true);
  });

  it("exige as duas datas no preset custom", () => {
    const result = reportPeriodSchema.safeParse({ preset: "custom", from: "2026-01-01" });

    expect(result.success).toBe(false);
  });

  it("rejeita intervalo invertido", () => {
    const result = reportPeriodSchema.safeParse({
      preset: "custom",
      from: "2026-07-31",
      to: "2026-07-01",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita data em formato inválido", () => {
    const result = reportPeriodSchema.safeParse({
      preset: "custom",
      from: "31/07/2026",
      to: "2026-07-31",
    });

    expect(result.success).toBe(false);
  });
});

describe("reportBlockSchema", () => {
  it("aplica objeto vazio de opções por omissão", () => {
    const result = reportBlockSchema.safeParse({ instanceId: "x", type: "cover" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.options).toEqual({});
  });

  it("rejeita tipo de bloco desconhecido", () => {
    const result = reportBlockSchema.safeParse({ instanceId: "x", type: "grafico-inexistente" });

    expect(result.success).toBe(false);
  });

  it("rejeita topN fora do limite", () => {
    const result = reportBlockSchema.safeParse({
      instanceId: "x",
      type: "counterparties",
      options: { topN: 99 },
    });

    expect(result.success).toBe(false);
  });
});

describe("reportConfigSchema", () => {
  it("preenche version, comparison, document e blocks por omissão", () => {
    const result = reportConfigSchema.safeParse({
      scope: { mode: "consolidated", companyId: null, organizationId: ORG },
      period: { preset: "ytd" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.version).toBe(REPORT_CONFIG_VERSION);
    expect(result.data.comparison).toBe("none");
    expect(result.data.document.title).toBe("Relatório Gerencial");
    expect(result.data.document.showPageNumbers).toBe(true);
    expect(result.data.blocks).toEqual([]);
  });

  it("rejeita mais de 60 blocos", () => {
    const blocks = Array.from({ length: 61 }, (_, i) => ({
      instanceId: String(i),
      type: "page-break",
      options: {},
    }));
    const result = reportConfigSchema.safeParse({ ...validConfig(), blocks });

    expect(result.success).toBe(false);
  });
});

describe("parseReportConfig", () => {
  it("faz o parse de uma config válida", () => {
    const parsed = parseReportConfig(validConfig());

    expect(parsed).not.toBeNull();
    expect(parsed?.blocks).toHaveLength(1);
  });

  it("injeta a versão corrente numa config gravada sem version", () => {
    const parsed = parseReportConfig(validConfig());

    expect(parsed?.version).toBe(REPORT_CONFIG_VERSION);
  });

  it("preserva uma versão já presente", () => {
    const parsed = parseReportConfig({ ...validConfig(), version: 1 });

    expect(parsed?.version).toBe(1);
  });

  it("retorna null em vez de lançar quando a config é inválida", () => {
    expect(parseReportConfig({ scope: { mode: "company" } })).toBeNull();
    expect(parseReportConfig(null)).toBeNull();
    expect(parseReportConfig("nada a ver")).toBeNull();
  });
});

describe("emptyReportConfig", () => {
  it("produz config válida para empresa", () => {
    const config = emptyReportConfig({
      organizationId: ORG,
      companyId: COMPANY,
      mode: "company",
    });

    expect(reportConfigSchema.safeParse(config).success).toBe(true);
    expect(config.scope.companyId).toBe(COMPANY);
  });

  it("descarta a empresa no escopo consolidado", () => {
    const config = emptyReportConfig({
      organizationId: ORG,
      companyId: COMPANY,
      mode: "consolidated",
    });

    expect(reportConfigSchema.safeParse(config).success).toBe(true);
    expect(config.scope.companyId).toBeNull();
  });
});
