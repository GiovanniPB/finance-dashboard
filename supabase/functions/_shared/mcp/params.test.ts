import { describe, expect, it } from "vitest";

import {
  brDate,
  MAX_PERIODO_DIAS,
  McpParamError,
  optionalDate,
  optionalLimit,
  requireAno,
  requireEscopo,
  requireMes,
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

describe("requireAno", () => {
  it("aceita ano de quatro dígitos", () => {
    expect(requireAno({ ano: 2026 })).toBe(2026);
  });

  it("recusa ano como texto", () => {
    expect(() => requireAno({ ano: "2026" })).toThrow(/quatro dígitos/);
  });

  it("recusa ano fora da faixa plausível", () => {
    expect(() => requireAno({ ano: 26 })).toThrow(/quatro dígitos/);
  });
});

describe("requireMes", () => {
  it("expande AAAA-MM no período do mês", () => {
    expect(requireMes({ mes: "2026-07" })).toEqual({
      mes: "2026-07",
      from: "2026-07-01",
      to: "2026-07-31",
      rotulo: "07/2026",
    });
  });

  it("acerta o último dia de fevereiro em ano comum", () => {
    expect(requireMes({ mes: "2026-02" }).to).toBe("2026-02-28");
  });

  it("acerta o último dia de fevereiro em ano bissexto", () => {
    expect(requireMes({ mes: "2024-02" }).to).toBe("2024-02-29");
  });

  it("acerta mês de 30 dias", () => {
    expect(requireMes({ mes: "2026-04" }).to).toBe("2026-04-30");
  });

  it("recusa mês inexistente", () => {
    expect(() => requireMes({ mes: "2026-13" })).toThrow(/mês inválido/);
  });

  it("recusa formato de data completa", () => {
    expect(() => requireMes({ mes: "2026-07-01" })).toThrow(/AAAA-MM/);
  });
});

describe("optionalDate", () => {
  it("devolve undefined quando ausente", () => {
    expect(optionalDate({}, "de")).toBeUndefined();
  });

  it("valida quando informada", () => {
    expect(() => optionalDate({ de: "31/07/2026" }, "de")).toThrow(/AAAA-MM-DD/);
  });

  it("aceita data válida", () => {
    expect(optionalDate({ de: "2026-07-31" }, "de")).toBe("2026-07-31");
  });
});
