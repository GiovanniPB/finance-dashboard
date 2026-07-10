import { describe, expect, it } from "vitest";

import { NFE_CLASSIFICATION, NFE_EMITENTE } from "./fixtures.ts";
import { buildNfePayload, type NfePayloadInput } from "./payloadNfe.ts";

type Obj = Record<string, unknown>;

function baseInput(): NfePayloadInput {
  return {
    dataEmissao: "2026-06-16T12:00:00-03:00",
    serie: "101",
    emitente: NFE_EMITENTE,
    destinatario: {
      documento: "529.982.247-25",
      nome: "Cliente Teste",
      email: "cliente@example.com",
      endereco: {
        line_1: "100, Rua Exemplo, Centro",
        zip_code: "01001-000",
        city: "São Paulo",
        state: "SP",
        country: "BR",
      },
    },
    valorProdutos: 882.0,
    classificacao: NFE_CLASSIFICATION,
  };
}

describe("buildNfePayload", () => {
  it("escolhe CFOP interno quando destinatário está na UF do emitente (SP→SP)", () => {
    const p = buildNfePayload(baseInput());
    const item = (p.items as Obj[])[0];
    expect(item.cfop).toBe("5101");
    expect(p.local_destino).toBe(1);
  });

  it("escolhe CFOP interestadual quando destinatário está em outra UF", () => {
    const input = baseInput();
    input.destinatario.endereco = { ...input.destinatario.endereco, state: "RJ" };
    const p = buildNfePayload(input);
    const item = (p.items as Obj[])[0];
    expect(item.cfop).toBe("6107");
    expect(p.local_destino).toBe(2);
  });

  it("declara a imunidade do ICMS via CST 41 + cBenef", () => {
    const item = (buildNfePayload(baseInput()).items as Obj[])[0];
    expect(item.icms_situacao_tributaria).toBe("41");
    expect(item.icms_origem).toBe(0);
    expect(item.codigo_beneficio_fiscal).toBe("SP070130");
  });

  it("mantém PIS/COFINS TRIBUTADOS (imunidade é só do ICMS — nunca zerar)", () => {
    const item = (buildNfePayload(baseInput()).items as Obj[])[0];
    expect(item.pis_situacao_tributaria).toBe("01");
    expect(item.pis_aliquota_porcentual).toBe(0.65);
    expect(item.cofins_situacao_tributaria).toBe("01");
    expect(item.cofins_aliquota_porcentual).toBe(3.0);
  });

  it("omite cBenef quando não configurado", () => {
    const input = baseInput();
    input.classificacao = { ...NFE_CLASSIFICATION, codigoBeneficioFiscal: null };
    const item = (buildNfePayload(input).items as Obj[])[0];
    expect(item.codigo_beneficio_fiscal).toBeUndefined();
  });

  it("usa cpf_destinatario p/ doc de 11 dígitos e cnpj p/ 14", () => {
    const cpf = buildNfePayload(baseInput()) as Obj;
    expect(cpf.cpf_destinatario).toBe("52998224725");
    expect(cpf.cnpj_destinatario).toBeUndefined();

    const input = baseInput();
    input.destinatario.documento = "37.383.325/0001-00";
    const cnpj = buildNfePayload(input) as Obj;
    expect(cnpj.cnpj_destinatario).toBe("37383325000100");
    expect(cnpj.cpf_destinatario).toBeUndefined();
  });

  it("extrai numero_destinatario quando o número vem na 2ª posição de line_1", () => {
    const input = baseInput();
    input.destinatario.endereco = {
      ...input.destinatario.endereco,
      line_1: "Rua Camarão, 144, Apto 703",
    };
    const p = buildNfePayload(input) as Obj;
    expect(p.logradouro_destinatario).toBe("Rua Camarão");
    expect(p.numero_destinatario).toBe("144");
  });

  it("usa 'S/N' quando não há número no endereço (evita rejeição de schema)", () => {
    const input = baseInput();
    input.destinatario.endereco = {
      ...input.destinatario.endereco,
      line_1: "D03, Condomínio Barlavento, Praia Vermelha",
    };
    const p = buildNfePayload(input) as Obj;
    expect(p.numero_destinatario).toBe("S/N");
  });

  it("emite emitente, série, NCM e info complementar a partir da config", () => {
    const p = buildNfePayload(baseInput()) as Obj;
    expect(p.cnpj_emitente).toBe("11222333000181");
    expect(p.regime_tributario_emitente).toBe(3);
    expect(p.serie).toBe("101");
    expect(p.valor_total).toBe(882.0);
    const item = (p.items as Obj[])[0];
    expect(item.codigo_ncm).toBe("49019900");
    expect(p.informacoes_adicionais_contribuinte).toContain("IMUNIDADE");
  });
});
