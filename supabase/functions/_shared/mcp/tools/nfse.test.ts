import { describe, expect, it } from "vitest";

import { fakeDataSource, filtroDe } from "../fixtures.ts";
import { mensagemDeErro, nfseStatus } from "./nfse.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const job = (over: Record<string, unknown>) => ({
  id: "j1",
  company_id: "emp-a",
  status: "authorized",
  ambiente: "producao",
  valor_servicos: "1000.00",
  numero_nfse: "123",
  focus_status: "autorizado",
  mensagem_sefaz: null,
  erros: null,
  attempts: 1,
  tomador_nome: "Cliente LTDA",
  tomador_documento: "12345678000199",
  created_at: "2026-07-10T12:00:00Z",
  emitida_em: "2026-07-10T12:05:00Z",
  ...over,
});

describe("mensagemDeErro", () => {
  it("prefere a mensagem da SEFAZ", () => {
    expect(mensagemDeErro({ mensagem_sefaz: "ISS inválido", erros: { a: 1 } })).toBe(
      "ISS inválido",
    );
  });

  it("cai para o jsonb de erros quando não há mensagem", () => {
    expect(mensagemDeErro({ mensagem_sefaz: null, erros: { campo: "cep" } })).toBe(
      '{"campo":"cep"}',
    );
  });

  it("trata jsonb vazio como ausência de erro", () => {
    expect(mensagemDeErro({ mensagem_sefaz: null, erros: {} })).toBeNull();
    expect(mensagemDeErro({ mensagem_sefaz: null, erros: [] })).toBeNull();
    expect(mensagemDeErro({ mensagem_sefaz: null, erros: null })).toBeNull();
  });
});

describe("nfse_status", () => {
  const jobs = [
    job({ id: "j1", status: "authorized" }),
    job({ id: "j2", status: "authorized", valor_servicos: "500.00" }),
    job({
      id: "j3",
      status: "rejected",
      valor_servicos: "200.00",
      mensagem_sefaz: "Endereço do tomador incompleto",
      tomador_documento: "12345678901",
      attempts: 3,
    }),
    job({ id: "j4", status: "queued", valor_servicos: "300.00" }),
  ];
  const ds = () => fakeDataSource({ query: { invoice_jobs: jobs } });

  it("resume autorizadas, travadas e em andamento", async () => {
    const r = await nfseStatus.run({ company_id: EMPRESA }, ds());

    expect(dados(r).resumo).toMatchObject({
      autorizadas: 2,
      valor_autorizado: 1500,
      travadas: 1,
      valor_travado: 200,
      em_andamento: 1,
      total: 4,
    });
  });

  it("lista as falhas com a mensagem que permite agir", async () => {
    const r = await nfseStatus.run({ company_id: EMPRESA }, ds());

    expect(dados(r).falhas).toHaveLength(1);
    expect(dados(r).falhas[0]).toMatchObject({
      id: "j3",
      erro: "Endereço do tomador incompleto",
      tentativas: 3,
    });
  });

  it("mascara CPF do tomador na lista de falhas", async () => {
    const r = await nfseStatus.run({ company_id: EMPRESA }, ds());

    expect(dados(r).falhas[0].tomador_documento).toBe("***.456.789-**");
  });

  it("não expõe e-mail nem endereço do tomador", async () => {
    const d = ds();
    await nfseStatus.run({ company_id: EMPRESA }, d);

    expect(d.queries[0].columns).not.toContain("tomador_email");
    expect(d.queries[0].columns).not.toContain("tomador_endereco");
  });

  it("omite as falhas quando pedido", async () => {
    const r = await nfseStatus.run({ company_id: EMPRESA, incluir_falhas: false }, ds());

    expect(dados(r).falhas).toBeUndefined();
  });

  it("fecha a janela pelo fim do dia, porque created_at é timestamptz", async () => {
    // Comparar timestamptz com a data crua excluiria o próprio dia final.
    const d = ds();
    await nfseStatus.run({ company_id: EMPRESA, from: "2026-07-01", to: "2026-07-31" }, d);

    expect(filtroDe(d.queries[0], "created_at", "lte")?.value).toBe("2026-07-31T23:59:59");
  });

  it("avisa quando há mais de um ambiente no resultado", async () => {
    const d = fakeDataSource({
      query: { invoice_jobs: [...jobs, job({ id: "j5", ambiente: "homologacao" })] },
    });
    const r = await nfseStatus.run({ company_id: EMPRESA }, d);

    expect(r.meta.avisos?.join(" ")).toMatch(/homologação não tem/);
  });

  it("não avisa de ambiente quando só há produção", async () => {
    const r = await nfseStatus.run({ company_id: EMPRESA }, ds());

    expect(r.meta.avisos?.join(" ")).not.toMatch(/homologação/);
  });

  it("avisa que vazio pode ser falta do módulo", async () => {
    const d = fakeDataSource({ query: { invoice_jobs: [] } });
    const r = await nfseStatus.run({ company_id: EMPRESA }, d);

    expect(r.meta.avisos?.join(" ")).toMatch(/módulo NFS-e/);
  });

  it("declara que é somente leitura na descrição", async () => {
    expect(nfseStatus.description).toMatch(/SOMENTE LEITURA/);
  });

  it("exige escopo", async () => {
    await expect(nfseStatus.run({}, ds())).rejects.toThrow(/list_companies/);
  });
});
