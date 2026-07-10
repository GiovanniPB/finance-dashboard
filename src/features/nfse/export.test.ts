import { describe, expect, it } from "vitest";

import type { InvoiceJob } from "./api";
import { buildExportRows } from "./export";

function job(overrides: Partial<InvoiceJob>): InvoiceJob {
  return {
    id: "j1",
    created_at: "2026-07-10T13:10:00Z",
    document_type: "nfe",
    ambiente: "producao",
    status: "authorized",
    serie: "101",
    numero_nfse: "17",
    chave_nfse: "chave-abc",
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
  it("mapeia campos fiscais com rótulos legíveis e valor numérico", () => {
    const [row] = buildExportRows([job({})]);
    expect(row).toMatchObject({
      Empresa: "Empresa",
      Documento: "NF-e",
      Ambiente: "Produção",
      Origem: "Retroativa",
      Status: "Autorizada",
      Série: "101",
      Número: "17",
      Tomador: "Fulano",
      "Documento tomador": "29615225878",
      "Valor (R$)": 1764,
      Conexão: "Conta X",
    });
    expect(typeof row["Valor (R$)"]).toBe("number");
  });

  it("marca origem Webhook quando não há source e trata campos ausentes", () => {
    const [row] = buildExportRows([
      job({ metadata: {}, numero_nfse: null, serie: null, chave_nfse: null, company: null }),
    ]);
    expect(row.Origem).toBe("Webhook");
    expect(row.Número).toBe("");
    expect(row.Série).toBe("");
    expect(row.Empresa).toBe("");
  });
});
