import { describe, expect, it } from "vitest";

import { normalizeCep, parseViaCepResponse } from "./cep.ts";

describe("normalizeCep", () => {
  it("mantém 8 dígitos removendo pontuação", () => {
    expect(normalizeCep("06.401-000")).toBe("06401000");
    expect(normalizeCep("06401000")).toBe("06401000");
  });

  it("rejeita CEP com tamanho errado ou vazio", () => {
    expect(normalizeCep("123")).toBeNull();
    expect(normalizeCep("")).toBeNull();
    expect(normalizeCep(null)).toBeNull();
  });
});

describe("parseViaCepResponse", () => {
  it("mapeia logradouro/bairro/localidade/uf/ibge", () => {
    const info = parseViaCepResponse({
      cep: "06401-000",
      logradouro: "Rua Exemplo",
      bairro: "Centro",
      localidade: "Barueri",
      uf: "SP",
      ibge: "3505708",
    });
    expect(info).toEqual({
      logradouro: "Rua Exemplo",
      bairro: "Centro",
      municipio: "Barueri",
      uf: "SP",
      ibge: "3505708",
    });
  });

  it("retorna null quando o ViaCEP sinaliza erro (CEP inexistente)", () => {
    expect(parseViaCepResponse({ erro: true })).toBeNull();
    expect(parseViaCepResponse({ erro: "true" })).toBeNull();
  });

  it("retorna null para entrada não-objeto", () => {
    expect(parseViaCepResponse(null)).toBeNull();
    expect(parseViaCepResponse("x")).toBeNull();
  });
});
