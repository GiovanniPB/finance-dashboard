import { describe, expect, it } from "vitest";

import { enrichTomadorAddress } from "./address.ts";

describe("enrichTomadorAddress", () => {
  it("deriva numero/logradouro/bairro de line_1, mas sem IBGE segue incompleto", () => {
    const r = enrichTomadorAddress({
      line_1: "100, Rua Exemplo, Centro",
      line_2: "Sala 5",
      zip_code: "06401-000",
      city: "Barueri",
      state: "SP",
    });

    // o IBGE só vem do ViaCEP (ou da revisão manual): sem ele o Focus rejeita
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(["codigoMunicipio"]);
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

  it("extrai número na 2ª posição (formato 'logradouro, numero, complemento')", () => {
    const r = enrichTomadorAddress({
      line_1: "Rua Camarão, 144, Apto 703",
      zip_code: "06401000",
      city: "Barueri",
      state: "SP",
    });

    expect(r.endereco.logradouro).toBe("Rua Camarão");
    expect(r.endereco.numero).toBe("144");
    expect(r.missing).not.toContain("numero");
  });

  it("extrai número na 2ª posição com 2 partes ('Av. Brasil, 250')", () => {
    const r = enrichTomadorAddress({
      line_1: "Av. Brasil, 250",
      zip_code: "06401000",
      city: "Barueri",
      state: "SP",
    });

    expect(r.endereco.logradouro).toBe("Av. Brasil");
    expect(r.endereco.numero).toBe("250");
  });

  it("sem número identificável ('D03, Condomínio X, Praia Y') -> numero null e incompleto", () => {
    const r = enrichTomadorAddress({
      line_1: "D03, Condomínio Barlavento, Praia Vermelha",
      zip_code: "06401000",
      city: "Barueri",
      state: "SP",
    });

    expect(r.endereco.numero).toBeNull();
    expect(r.endereco.logradouro).toBe("D03");
    expect(r.missing).toContain("numero");
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
    expect(r.missing).toEqual(["bairro", "codigoMunicipio"]);
  });

  it("endereço nulo -> incompleto com todos os campos faltando", () => {
    const r = enrichTomadorAddress(null);
    expect(r.complete).toBe(false);
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

  it("normaliza CEP para dígitos", () => {
    const r = enrichTomadorAddress({
      line_1: "10, Rua A, Bairro B",
      zip_code: "06.401-000",
      city: "Barueri",
      state: "SP",
    });
    expect(r.endereco.cep).toBe("06401000");
  });

  describe("enriquecimento ViaCEP (cep_info)", () => {
    it("usa cep_info para logradouro/bairro/município/UF e fornece o IBGE", () => {
      const r = enrichTomadorAddress({
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
      expect(r.endereco.bairro).toBe("Bairro Correto");
      expect(r.endereco.municipio).toBe("Barueri");
      expect(r.endereco.uf).toBe("SP");
      expect(r.endereco.codigoMunicipio).toBe("3505708");
      expect(r.endereco.numero).toBe("100"); // número segue vindo de line_1
      expect(r.complete).toBe(true);
    });

    it("cep_info completa o bairro ausente em line_1 (deixa o endereço completo)", () => {
      const r = enrichTomadorAddress({
        line_1: "250, Av. Brasil", // sem bairro
        zip_code: "06401000",
        city: "Barueri",
        state: "SP",
        cep_info: { bairro: "Centro", ibge: "3505708" },
      });

      expect(r.endereco.bairro).toBe("Centro");
      expect(r.complete).toBe(true);
      expect(r.missing).toEqual([]);
    });
  });

  describe("correção manual (nfse_override)", () => {
    it("completa os campos que a derivação não achou e libera a emissão", () => {
      const r = enrichTomadorAddress({
        line_1: "Rua Escócia , 214", // sem bairro, e o CEP não resolveu no ViaCEP
        zip_code: "35180000",
        city: "Conselheiro Pena",
        state: "MG",
        nfse_override: { bairro: "Centro", codigoMunicipio: "3118304" },
      });

      expect(r.endereco.bairro).toBe("Centro");
      expect(r.endereco.codigoMunicipio).toBe("3118304");
      expect(r.endereco.logradouro).toBe("Rua Escócia"); // segue derivado
      expect(r.endereco.numero).toBe("214");
      expect(r.complete).toBe(true);
      expect(r.missing).toEqual([]);
    });

    it("tem precedência sobre o ViaCEP quando o operador discorda dele", () => {
      const r = enrichTomadorAddress({
        line_1: "100, Rua Antiga, Bairro Antigo",
        zip_code: "06401000",
        city: "Barueri",
        state: "SP",
        cep_info: { logradouro: "Rua do ViaCEP", bairro: "Bairro do ViaCEP", ibge: "3505708" },
        nfse_override: { logradouro: "Rua Corrigida", numero: "999" },
      });

      expect(r.endereco.logradouro).toBe("Rua Corrigida");
      expect(r.endereco.numero).toBe("999");
      expect(r.endereco.bairro).toBe("Bairro do ViaCEP"); // não sobrescrito -> derivado
    });

    it("ignora campos vazios do override (não apaga o que já estava derivado)", () => {
      const r = enrichTomadorAddress({
        line_1: "100, Rua Exemplo, Centro",
        zip_code: "06401000",
        city: "Barueri",
        state: "SP",
        cep_info: { ibge: "3505708" },
        nfse_override: { logradouro: "   ", bairro: "" },
      });

      expect(r.endereco.logradouro).toBe("Rua Exemplo");
      expect(r.endereco.bairro).toBe("Centro");
      expect(r.complete).toBe(true);
    });

    it("normaliza o CEP corrigido para dígitos", () => {
      const r = enrichTomadorAddress({
        line_1: "10, Rua A, Bairro B",
        zip_code: "06401000",
        city: "Barueri",
        state: "SP",
        nfse_override: { cep: "35.180-000", codigoMunicipio: "3118304" },
      });

      expect(r.endereco.cep).toBe("35180000");
    });
  });
});
