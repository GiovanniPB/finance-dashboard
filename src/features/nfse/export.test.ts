import { describe, expect, it } from "vitest";

import type { InvoiceJob } from "./api";
import { buildExportRows, exportFileBaseName } from "./export";

function job(overrides: Partial<InvoiceJob>): InvoiceJob {
  return {
    id: "j1",
    created_at: "2026-07-10T13:10:00Z",
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
        numero_nfse: null,
        serie: null,
        chave_nfse: null,
        protocolo: null,
        xml_path: null,
      }),
    ]);
    expect(row.Origem).toBe("Webhook");
    expect(row["Data de emissão"]).toBe("");
    expect(row["Chave de acesso"]).toBe("");
    expect(row["Arquivo XML"]).toBe("");
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
