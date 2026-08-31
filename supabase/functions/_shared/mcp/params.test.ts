import { describe, expect, it } from "vitest";

import {
  brDate,
  MAX_PERIODO_DIAS,
  McpParamError,
  optionalLimit,
  requireEscopo,
  requirePeriodo,
  requireUuid,
} from "./params.ts";

const UUID = "11111111-2222-3333-4444-555555555555";

describe("requireUuid", () => {
  it("aceita um uuid válido", () => {
    expect(requireUuid({ company_id: UUID }, "company_id", "")).toBe(UUID);
  });

  it("rejeita texto que não é uuid e explica o que fazer", () => {
    expect(() => requireUuid({ company_id: "otm" }, "company_id", "Use list_companies.")).toThrow(
      /obrigatório e deve ser um UUID.*list_companies/s,
    );
  });
});

describe("requirePeriodo", () => {
  it("devolve o rótulo em pt-BR", () => {
    const p = requirePeriodo({ from: "2026-07-01", to: "2026-07-31" });
    expect(p.rotulo).toBe("01/07/2026 a 31/07/2026");
  });

  it("rejeita período invertido", () => {
    expect(() => requirePeriodo({ from: "2026-07-31", to: "2026-07-01" })).toThrow(McpParamError);
  });

  it("rejeita data inexistente no calendário", () => {
    expect(() => requirePeriodo({ from: "2026-02-30", to: "2026-03-01" })).toThrow(
      /não é uma data válida/,
    );
  });

  it("rejeita janela maior que o teto", () => {
    expect(() => requirePeriodo({ from: "2020-01-01", to: "2026-01-01" })).toThrow(
      new RegExp(`excede o máximo de ${MAX_PERIODO_DIAS}`),
    );
  });

  it("exige as duas datas", () => {
    expect(() => requirePeriodo({ from: "2026-07-01" })).toThrow(/"to" é obrigatório/);
  });
});

describe("requireEscopo", () => {
  it("aponta o caminho quando nada foi informado", () => {
    expect(() => requireEscopo({})).toThrow(/list_companies/);
  });

  it("rejeita empresa e organização juntas", () => {
    expect(() => requireEscopo({ company_id: UUID, organization_id: UUID })).toThrow(
      /nunca os dois/,
    );
  });

  it("aceita apenas a organização", () => {
    expect(requireEscopo({ organization_id: UUID })).toEqual({
      companyId: undefined,
      organizationId: UUID,
    });
  });
});

describe("optionalLimit", () => {
  it("usa o padrão quando ausente", () => {
    expect(optionalLimit({}, "limite", 50, 200)).toBe(50);
  });

  it("corta no teto em vez de recusar — o modelo não precisa adivinhar o máximo", () => {
    expect(optionalLimit({ limite: 5000 }, "limite", 50, 200)).toBe(200);
  });

  it("rejeita valor não inteiro", () => {
    expect(() => optionalLimit({ limite: 1.5 }, "limite", 50, 200)).toThrow(McpParamError);
  });
});

describe("brDate", () => {
  it("converte sem passar por Date (imune a fuso)", () => {
    expect(brDate("2026-01-01")).toBe("01/01/2026");
  });
});
