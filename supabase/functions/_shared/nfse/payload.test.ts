import { describe, expect, it } from "vitest";

import { buildNfsePayload, type NfsePayloadInput } from "./payload.ts";

function baseInput(): NfsePayloadInput {
  return {
    dataEmissao: "2026-06-16T12:00:00-03:00",
    prestador: {
      cnpj: "55.481.643/0001-96",
      inscricaoMunicipal: "5BF7555",
      municipioIbge: "3505708",
      optanteSimples: true,
    },
    tomador: {
      documento: "529.982.247-25",
      nome: "Renato Teste",
      email: "tomador@example.com",
      endereco: {
        line_1: "Rua X, 54",
        zip_code: "13210-275",
        city: "Jundiaí",
        state: "SP",
        country: "BR",
      },
    },
    servico: {
      valorServicos: 882.0,
      itemListaServico: "01.07",
      codigoTributarioMunicipio: "010700",
      aliquotaIss: 0.05,
      discriminacao: "Serviço de tecnologia",
    },
  };
}

type Obj = Record<string, unknown>;

describe("buildNfsePayload", () => {
  it("monta estrutura aninhada prestador/tomador/servico", () => {
    const p = buildNfsePayload(baseInput());
    const prestador = p.prestador as Obj;
    const servico = p.servico as Obj;

    expect(prestador.cnpj).toBe("55481643000196"); // só dígitos
    expect(prestador.inscricao_municipal).toBe("5BF7555");
    expect(prestador.codigo_municipio).toBe("3505708");
    expect(servico.valor_servicos).toBe(882.0);
    expect(servico.item_lista_servico).toBe("01.07");
    expect(servico.codigo_tributario_municipio).toBe("010700");
    expect(servico.aliquota).toBe(0.05);
    expect(servico.iss_retido).toBe(false);
    expect(p.optante_simples_nacional).toBe(true);
    expect(p.data_emissao).toBe("2026-06-16T12:00:00-03:00");
  });

  it("usa tomador.cpf para documento de 11 dígitos (e omite cnpj)", () => {
    const tomador = buildNfsePayload(baseInput()).tomador as Obj;
    expect(tomador.cpf).toBe("52998224725");
    expect(tomador.cnpj).toBeUndefined();
    const endereco = tomador.endereco as Obj;
    expect(endereco.cep).toBe("13210275"); // só dígitos
    expect(endereco.municipio).toBe("Jundiaí");
  });

  it("inclui codigo_municipio (IBGE) do tomador quando enriquecido por ViaCEP", () => {
    const input = baseInput();
    input.tomador.endereco = {
      line_1: "100, Rua X, Centro",
      zip_code: "13210-275",
      city: "Jundiaí",
      state: "SP",
      cep_info: { municipio: "Jundiaí", uf: "SP", ibge: "3525904" },
    };
    const tomador = buildNfsePayload(input).tomador as Obj;
    const endereco = tomador.endereco as Obj;
    expect(endereco.codigo_municipio).toBe("3525904");
  });

  it("usa tomador.cnpj para documento de 14 dígitos", () => {
    const input = baseInput();
    input.tomador.documento = "37.383.325/0001-00";
    const tomador = buildNfsePayload(input).tomador as Obj;
    expect(tomador.cnpj).toBe("37383325000100");
    expect(tomador.cpf).toBeUndefined();
  });

  it("não inclui documento do tomador quando ausente", () => {
    const input = baseInput();
    input.tomador.documento = null;
    const tomador = buildNfsePayload(input).tomador as Obj;
    expect(tomador.cpf).toBeUndefined();
    expect(tomador.cnpj).toBeUndefined();
  });

  it("inclui os códigos do Simples de Barueri quando configurados", () => {
    const input = baseInput();
    input.prestador.codigoOpcaoSimplesNacional = 3;
    input.prestador.regimeTributarioSimplesNacional = 1;
    const p = buildNfsePayload(input);
    expect(p.codigo_opcao_simples_nacional).toBe(3);
    expect(p.regime_tributario_simples_nacional).toBe(1);
  });

  it("omite os códigos do Simples quando não configurados (municípios que não usam)", () => {
    const p = buildNfsePayload(baseInput());
    expect(p.codigo_opcao_simples_nacional).toBeUndefined();
    expect(p.regime_tributario_simples_nacional).toBeUndefined();
  });
});
