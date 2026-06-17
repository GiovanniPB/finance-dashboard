import { describe, expect, it } from "vitest";

import { enrichTomadorAddress } from "./address.ts";

describe("enrichTomadorAddress", () => {
  it("deriva numero/logradouro/bairro de line_1 no formato pagar.me e fica completo", () => {
    const r = enrichTomadorAddress({
      line_1: "100, Rua Exemplo, Centro",
      line_2: "Sala 5",
      zip_code: "06401-000",
      city: "Barueri",
      state: "SP",
    });

    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.endereco).toMatchObject({
      numero: "100",
      logradouro: "Rua Exemplo",
      bairro: "Centro",
      complemento: "Sala 5",
      cep: "06401000",
      municipio: "Barueri",
      uf: "SP",
    });
  });

  it("marca incompleto e lista o que falta quando não há bairro nem número", () => {
    const r = enrichTomadorAddress({
      line_1: "Rua Sem Numero",
      zip_code: "06401000",
      city: "Barueri",
      state: "SP",
    });

    expect(r.complete).toBe(false);
    expect(r.missing).toContain("numero");
    expect(r.missing).toContain("bairro");
    expect(r.endereco.logradouro).toBe("Rua Sem Numero");
  });

  it("trata 2 partes como numero + logradouro (sem bairro -> incompleto)", () => {
    const r = enrichTomadorAddress({
      line_1: "250, Av. Brasil",
      zip_code: "06401000",
      city: "Barueri",
      state: "SP",
    });

    expect(r.endereco.numero).toBe("250");
    expect(r.endereco.logradouro).toBe("Av. Brasil");
    expect(r.endereco.bairro).toBeNull();
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(["bairro"]);
  });

  it("endereço nulo -> incompleto com todos os campos faltando", () => {
    const r = enrichTomadorAddress(null);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(["logradouro", "numero", "bairro", "cep", "municipio", "uf"]);
  });

  it("normaliza CEP para dígitos", () => {
    const r = enrichTomadorAddress({
      line_1: "10, Rua A, Bairro B",
      zip_code: "06.401-000",
      city: "Barueri",
      state: "SP",
    });
    expect(r.endereco.cep).toBe("06401000");
  });
});
