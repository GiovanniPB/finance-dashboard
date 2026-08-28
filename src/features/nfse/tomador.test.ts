import { describe, expect, it } from "vitest";

import {
  buildEnderecoOverride,
  changedEnderecoFields,
  deriveTomadorEndereco,
  hasEnderecoOverride,
  type TomadorEndereco,
} from "./tomador";

/**
 * Estes casos espelham `supabase/functions/_shared/nfse/address.test.ts`. Se um
 * lado mudar e o outro não, a tela passa a prometer um endereço diferente do que
 * o worker emite — que é justamente o bug que a revisão manual existe para tirar.
 */
const values = (over: Partial<Record<keyof TomadorEndereco, string>> = {}) => ({
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cep: "",
  municipio: "",
  uf: "",
  codigoMunicipio: "",
  ...over,
});

describe("deriveTomadorEndereco", () => {
  it("deriva numero/logradouro/bairro de line_1 e acusa o IBGE ausente", () => {
    const r = deriveTomadorEndereco({
      line_1: "100, Rua Exemplo, Centro",
      line_2: "Sala 5",
      zip_code: "06401-000",
      city: "Barueri",
      state: "SP",
    });

    expect(r.endereco).toMatchObject({
      numero: "100",
      logradouro: "Rua Exemplo",
      bairro: "Centro",
      complemento: "Sala 5",
      cep: "06401000",
      municipio: "Barueri",
      uf: "SP",
    });
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(["codigoMunicipio"]);
  });

  it("extrai número na 2ª posição ('logradouro, numero, complemento')", () => {
    const r = deriveTomadorEndereco({ line_1: "Rua Camarão, 144, Apto 703" });
    expect(r.endereco.logradouro).toBe("Rua Camarão");
    expect(r.endereco.numero).toBe("144");
  });

  it("usa cep_info para logradouro/bairro/município/UF e o IBGE", () => {
    const r = deriveTomadorEndereco({
      line_1: "100, Endereço Antigo",
      zip_code: "06401000",
      city: "Cidade Errada",
      state: "RJ",
      cep_info: {
        logradouro: "Rua Correta",
        bairro: "Bairro Correto",
        municipio: "Barueri",
        uf: "SP",
        ibge: "3505708",
      },
    });

    expect(r.endereco.logradouro).toBe("Rua Correta");
    expect(r.endereco.municipio).toBe("Barueri");
    expect(r.endereco.codigoMunicipio).toBe("3505708");
    expect(r.endereco.numero).toBe("100"); // número segue vindo de line_1
    expect(r.complete).toBe(true);
  });

  it("a correção manual tem precedência sobre o ViaCEP", () => {
    const r = deriveTomadorEndereco({
      line_1: "100, Rua Antiga, Bairro Antigo",
      zip_code: "06401000",
      cep_info: { logradouro: "Rua do ViaCEP", bairro: "Bairro do ViaCEP", ibge: "3505708" },
      nfse_override: { logradouro: "Rua Corrigida", numero: "999" },
    });

    expect(r.endereco.logradouro).toBe("Rua Corrigida");
    expect(r.endereco.numero).toBe("999");
    expect(r.endereco.bairro).toBe("Bairro do ViaCEP");
  });

  it("lista tudo que falta num endereço ausente", () => {
    const r = deriveTomadorEndereco(null);
    expect(r.missing).toEqual([
      "logradouro",
      "numero",
      "bairro",
      "cep",
      "municipio",
      "uf",
      "codigoMunicipio",
    ]);
  });
});

describe("buildEnderecoOverride", () => {
  it("preserva o payload original do pagar.me e grava a correção ao lado", () => {
    const raw = { line_1: "Rua Escócia , 214", zip_code: "35180000", city: "Conselheiro Pena" };
    const next = buildEnderecoOverride(
      raw,
      values({ bairro: "Centro", codigoMunicipio: "3118304" }),
    );

    expect(next.line_1).toBe("Rua Escócia , 214"); // origem intacta
    expect(next.nfse_override).toEqual({ bairro: "Centro", codigoMunicipio: "3118304" });
  });

  it("omite campos vazios (o que não for digitado segue derivado)", () => {
    const next = buildEnderecoOverride({}, values({ bairro: "  ", uf: "MG" }));
    expect(next.nfse_override).toEqual({ uf: "MG" });
  });

  it("normaliza o CEP corrigido para dígitos", () => {
    const next = buildEnderecoOverride({}, values({ cep: "35.180-000" }));
    expect(next.nfse_override).toEqual({ cep: "35180000" });
  });

  it("a correção gravada é o que a derivação passa a devolver", () => {
    const raw = { line_1: "Rua Escócia , 214", zip_code: "35180000" };
    const next = buildEnderecoOverride(
      raw,
      values({
        logradouro: "Rua Escócia",
        numero: "214",
        bairro: "Centro",
        cep: "35180000",
        municipio: "Conselheiro Pena",
        uf: "MG",
        codigoMunicipio: "3118304",
      }),
    );

    expect(deriveTomadorEndereco(next).complete).toBe(true);
  });
});

describe("changedEnderecoFields", () => {
  it("aponta só os campos em que o operador mudou o valor derivado", () => {
    const raw = { line_1: "100, Rua Exemplo, Centro", zip_code: "06401000" };
    const changed = changedEnderecoFields(
      raw,
      values({
        logradouro: "Rua Exemplo",
        numero: "100",
        bairro: "Centro",
        cep: "06401000",
        codigoMunicipio: "3505708",
      }),
    );

    expect(changed).toEqual(["codigoMunicipio"]);
  });
});

describe("hasEnderecoOverride", () => {
  it("distingue endereço revisado de endereço cru", () => {
    expect(hasEnderecoOverride({ line_1: "Rua A" })).toBe(false);
    expect(hasEnderecoOverride({ nfse_override: {} })).toBe(false);
    expect(hasEnderecoOverride({ nfse_override: { bairro: "Centro" } })).toBe(true);
    expect(hasEnderecoOverride(null)).toBe(false);
  });
});
