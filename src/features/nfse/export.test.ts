import { describe, expect, it } from "vitest";

import type { InvoiceJob } from "./api";
import { buildExportRows, exportFileBaseName } from "./export";

function job(overrides: Partial<InvoiceJob>): InvoiceJob {
  return {
    id: "j1",
    created_at: "2026-07-10T13:10:00Z",
    charge_created_at: "2026-07-08T18:20:00Z",
    paid_at: "2026-07-08T18:21:30Z",
    emitida_em: "2026-07-10T13:47:42Z",
    document_type: "nfe",
    ambiente: "producao",
    status: "authorized",
    serie: "101",
    numero_nfse: "17",
    chave_nfse: "35260737383325000100550010000000231004946510",
    protocolo: "135260006475615",
    mensagem_sefaz: "Autorizado o uso da NF-e",
    xml_path: "c1/ref.xml",
    danfse_path: "c1/ref.pdf",
    tomador_nome: "Fulano",
    tomador_documento: "29615225878",
    tomador_email: "fulano@example.com",
    tomador_endereco: {
      line_1: "144, Rua Camarao, Centro",
      line_2: "Apto 703",
      zip_code: "06455-010",
      city: "Barueri",
      state: "SP",
      cep_info: {
        logradouro: "Rua Camarão",
        bairro: "Jardim Paulista",
        municipio: "Barueri",
        uf: "SP",
        ibge: "3505708",
      },
    },
    valor_servicos: 1764,
    pagarme_charge_id: "ch_1",
    metadata: { source: "backfill" },
    company: { id: "c1", legal_name: "Empresa LTDA", trade_name: "Empresa" },
    account: { id: "a1", label: "Conta X", slug: "conta-x" },
    ...overrides,
  } as InvoiceJob;
}

describe("buildExportRows", () => {
  it("inclui os campos fiscais que a contabilidade imputa", () => {
    const [row] = buildExportRows([job({})]);
    expect(String(row["Data de emissão"])).toContain("2026");
    // a venda: quando o cliente comprou e quando pagou (o que gera a nota)
    expect(row["Data da compra"]).toBe("08/07/2026");
    expect(row["Data do pagamento"]).toBe("08/07/2026");
    expect(row).toMatchObject({
      Empresa: "Empresa",
      Documento: "NF-e",
      Série: "101",
      Número: "17",
      "Chave de acesso": "35260737383325000100550010000000231004946510",
      Protocolo: "135260006475615",
      Status: "Autorizada",
      Ambiente: "Produção",
      Origem: "Retroativa",
      "Valor (R$)": 1764,
      "Mensagem SEFAZ": "Autorizado o uso da NF-e",
      "Arquivo XML": "35260737383325000100550010000000231004946510.xml",
    });
    expect(typeof row["Valor (R$)"]).toBe("number");
  });

  it("trata campos ausentes e origem webhook; sem XML quando não autorizada", () => {
    const [row] = buildExportRows([
      job({
        metadata: {},
        status: "pending_review",
        emitida_em: null,
        charge_created_at: null,
        paid_at: null,
        numero_nfse: null,
        serie: null,
        chave_nfse: null,
        protocolo: null,
        xml_path: null,
      }),
    ]);
    expect(row.Origem).toBe("Webhook");
    expect(row["Data de emissão"]).toBe("");
    expect(row["Data da compra"]).toBe("");
    expect(row["Data do pagamento"]).toBe("");
    expect(row["Chave de acesso"]).toBe("");
    expect(row["Arquivo XML"]).toBe("");
  });
});

describe("buildExportRows — dados do tomador", () => {
  it("exporta e-mail e o endereço derivado (o mesmo que vai na nota)", () => {
    const [row] = buildExportRows([job({})]);
    expect(row).toMatchObject({
      Tomador: "Fulano",
      "Documento tomador": "29615225878",
      "E-mail tomador": "fulano@example.com",
      // ViaCEP (cep_info) tem precedência sobre o parse do line_1
      Logradouro: "Rua Camarão",
      Bairro: "Jardim Paulista",
      Complemento: "Apto 703",
      Município: "Barueri",
      UF: "SP",
      "Código IBGE": "3505708",
    });
  });

  it("não confunde o número do endereço com o número da nota", () => {
    const [row] = buildExportRows([job({})]);
    expect(row["Número"]).toBe("17"); // número da NFS-e
    expect(row["Número (endereço)"]).toBe("144"); // número do logradouro
  });

  it("mantém o CEP como texto de 8 dígitos (o zero à esquerda sobrevive)", () => {
    const [row] = buildExportRows([job({})]);
    expect(row.CEP).toBe("06455010");
    expect(typeof row.CEP).toBe("string");
  });

  it("prefere a correção manual do endereço (nfse_override)", () => {
    const [row] = buildExportRows([
      job({
        tomador_endereco: {
          line_1: "144, Rua Camarao, Centro",
          zip_code: "06455-010",
          nfse_override: { bairro: "Centro", cep: "01001-000", numero: "1500" },
        },
      }),
    ]);
    expect(row.Bairro).toBe("Centro");
    expect(row.CEP).toBe("01001000");
    expect(row["Número (endereço)"]).toBe("1500");
  });

  it("deixa as colunas do tomador vazias quando não há endereço nem e-mail", () => {
    const [row] = buildExportRows([job({ tomador_email: null, tomador_endereco: null })]);
    expect(row["E-mail tomador"]).toBe("");
    expect(row.Logradouro).toBe("");
    expect(row["Número (endereço)"]).toBe("");
    expect(row.Complemento).toBe("");
    expect(row.Bairro).toBe("");
    expect(row.CEP).toBe("");
    expect(row.Município).toBe("");
    expect(row.UF).toBe("");
    expect(row["Código IBGE"]).toBe("");
  });
});

describe("exportFileBaseName", () => {
  it("usa a chave; cai para número e depois id; sanitiza", () => {
    expect(exportFileBaseName(job({}))).toBe("35260737383325000100550010000000231004946510");
    expect(exportFileBaseName(job({ chave_nfse: null }))).toBe("17");
    expect(exportFileBaseName(job({ chave_nfse: null, numero_nfse: null, id: "a b/c" }))).toBe(
      "a_b_c",
    );
  });
});
