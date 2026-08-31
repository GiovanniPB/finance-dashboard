import { describe, expect, it } from "vitest";

import { brl, maskDocument, toNumber, truncate } from "./format.ts";

describe("toNumber", () => {
  it("converte a string numérica que o PostgREST devolve", () => {
    expect(toNumber("1234.56")).toBe(1234.56);
  });

  it("trata nulo e vazio como zero", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber("")).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });

  it("descarta valor não numérico em vez de propagar NaN", () => {
    expect(toNumber("abc")).toBe(0);
  });
});

describe("brl", () => {
  it("formata com separador de milhar e vírgula decimal", () => {
    expect(brl(1234.5)).toBe("R$ 1.234,50");
  });

  it("formata milhões", () => {
    expect(brl(2_500_000)).toBe("R$ 2.500.000,00");
  });

  it("põe o sinal antes do símbolo", () => {
    expect(brl(-89.9)).toBe("-R$ 89,90");
  });

  it("formata zero", () => {
    expect(brl(0)).toBe("R$ 0,00");
  });
});

describe("maskDocument", () => {
  it("mascara CPF — é PII e não tem uso analítico", () => {
    expect(maskDocument("123.456.789-09")).toBe("***.456.789-**");
  });

  it("preserva CNPJ — é dado público e identifica o fornecedor", () => {
    expect(maskDocument("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("devolve nulo quando não há documento", () => {
    expect(maskDocument(null)).toBeNull();
    expect(maskDocument("")).toBeNull();
  });

  it("não deixa passar documento de formato desconhecido", () => {
    expect(maskDocument("123")).toBe("***");
  });
});

describe("truncate", () => {
  it("corta descrição longa", () => {
    expect(truncate("a".repeat(200)).length).toBe(120);
  });

  it("preserva descrição curta", () => {
    expect(truncate("Aluguel julho")).toBe("Aluguel julho");
  });
});
