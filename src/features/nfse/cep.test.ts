import { describe, expect, it, vi } from "vitest";

import { lookupCep, normalizeCep, parseViaCepResponse } from "./cep";

describe("normalizeCep", () => {
  it("aceita CEP formatado e devolve só os dígitos", () => {
    expect(normalizeCep("06.401-000")).toBe("06401000");
  });

  it("rejeita CEP com tamanho errado ou vazio", () => {
    expect(normalizeCep("0640100")).toBeNull();
    expect(normalizeCep("")).toBeNull();
    expect(normalizeCep(null)).toBeNull();
  });
});

describe("parseViaCepResponse", () => {
  it("mapeia localidade -> municipio e mantém o IBGE", () => {
    const data = parseViaCepResponse({
      logradouro: "Rua Exemplo",
      bairro: "Centro",
      localidade: "Barueri",
      uf: "SP",
      ibge: "3505708",
    });

    expect(data).toEqual({
      logradouro: "Rua Exemplo",
      bairro: "Centro",
      municipio: "Barueri",
      uf: "SP",
      ibge: "3505708",
    });
  });

  it("trata CEP inexistente ({ erro: true }) como ausência", () => {
    expect(parseViaCepResponse({ erro: true })).toBeNull();
    expect(parseViaCepResponse({ erro: "true" })).toBeNull();
  });

  it("trata resposta vazia como ausência", () => {
    expect(parseViaCepResponse({ logradouro: "", bairro: "  " })).toBeNull();
    expect(parseViaCepResponse(null)).toBeNull();
  });
});

describe("lookupCep", () => {
  it("não vai à rede quando o CEP é inválido", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(lookupCep("123")).resolves.toEqual({ status: "invalid" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("devolve os dados do ViaCEP quando encontra", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ localidade: "Barueri", uf: "SP", ibge: "3505708" })),
    );

    const result = await lookupCep("06401-000");

    expect(result).toEqual({
      status: "ok",
      data: { logradouro: null, bairro: null, municipio: "Barueri", uf: "SP", ibge: "3505708" },
    });
    vi.restoreAllMocks();
  });

  it("distingue CEP inexistente de falha de rede", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ erro: true })));
    await expect(lookupCep("06401000")).resolves.toEqual({ status: "not_found" });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(lookupCep("06401000")).resolves.toEqual({
      status: "error",
      message: "offline",
    });
    vi.restoreAllMocks();
  });
});
