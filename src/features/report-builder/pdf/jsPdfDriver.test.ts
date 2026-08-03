/**
 * Teste de integração do pipeline de geração: config + dados → PDF real.
 *
 * Não valida pixels — valida o que dá errado de verdade num gerador de PDF:
 * contagem de páginas, paginação de tabela longa, blocos sem renderer e nome de
 * arquivo. O `data` é injetado, então nada aqui toca o Supabase.
 */
import { describe, expect, it } from "vitest";

import type { DreComputedRow } from "@/features/dre/types";

import { createBlock } from "../blocks/catalog";
import { emptyReportData, type ReportData } from "../data/types";
import type { ResolvedPeriod } from "../period";
import { emptyReportConfig, type ReportBlock, type ReportConfig } from "../schema";
import { BLOCK_RENDERERS } from "./blocks";
import { buildFilename, generateReportPdf } from "./jsPdfDriver";

const ORG = "00000000-0000-0000-0000-000000000001";
const COMPANY = "11111111-1111-1111-1111-111111111111";

const PERIOD: ResolvedPeriod = {
  from: "2026-07-01",
  to: "2026-07-31",
  label: "julho de 2026",
};

function dreRow(partial: Partial<DreComputedRow> = {}): DreComputedRow {
  return {
    account_id: partial.account_id ?? "acc",
    parent_id: partial.parent_id ?? null,
    code: partial.code ?? "3.01",
    name: partial.name ?? "Conta de teste",
    kind: partial.kind ?? "operating_expense",
    dre_section: partial.dre_section ?? null,
    is_summary: partial.is_summary ?? false,
    below_the_line: partial.below_the_line ?? false,
    sign_hint: partial.sign_hint ?? null,
    sort_order: partial.sort_order ?? 0,
    total: partial.total ?? 0,
    total_cash: partial.total_cash ?? 0,
    effective_total: partial.effective_total ?? 1000,
    effective_total_cash: partial.effective_total_cash ?? 900,
    depth: partial.depth ?? 0,
  };
}

function configWith(blocks: ReportBlock[]): ReportConfig {
  const base = emptyReportConfig({
    organizationId: ORG,
    companyId: COMPANY,
    mode: "company",
  });
  return { ...base, blocks };
}

function generate(blocks: ReportBlock[], data: Partial<ReportData>) {
  return generateReportPdf({
    config: configWith(blocks),
    data: { ...emptyReportData(), ...data },
    period: PERIOD,
    comparisonPeriod: null,
    scopeLabel: "RCO Tecnologia",
    issuedAt: "2026-08-03",
  });
}

describe("generateReportPdf", () => {
  it("gera um blob de PDF", async () => {
    const report = await generate([createBlock("cover", "c1")], { dre: null });

    expect(report.blob).toBeInstanceOf(Blob);
    expect(report.blob.size).toBeGreaterThan(0);
    expect(report.pageCount).toBe(1);
  });

  it("põe a capa numa página própria antes do bloco seguinte", async () => {
    const report = await generate([createBlock("cover", "c1"), createBlock("dre", "d1")], {
      dre: [dreRow()],
    });

    expect(report.pageCount).toBe(2);
  });

  it("não deixa página em branco quando a capa é o último bloco", async () => {
    const report = await generate([createBlock("dre", "d1"), createBlock("cover", "c1")], {
      dre: [dreRow()],
    });

    expect(report.pageCount).toBe(2);
  });

  it("pagina uma DRE longa em várias páginas", async () => {
    const rows = Array.from({ length: 220 }, (_, i) =>
      dreRow({ account_id: `a${i}`, code: `3.${i}`, name: `Conta ${i}` }),
    );

    const report = await generate([createBlock("dre", "d1")], { dre: rows });

    expect(report.pageCount).toBeGreaterThan(2);
  });

  it("renderiza DRE sem dados sem estourar", async () => {
    const report = await generate([createBlock("dre", "d1")], { dre: [] });

    expect(report.pageCount).toBe(1);
    expect(report.skippedBlocks).toEqual([]);
  });

  // Todo o catálogo tem renderer, então a ausência é simulada com um registro
  // parcial — que é também o mecanismo real caso um bloco novo entre no catálogo
  // antes do seu renderer.
  it("reporta blocos sem renderer em vez de falhar", async () => {
    const report = await generateReportPdf({
      config: configWith([
        createBlock("dre", "d1"),
        createBlock("bank-balances", "bb1"),
        createBlock("counterparties", "cp1"),
      ]),
      data: { ...emptyReportData(), dre: [dreRow()] },
      period: PERIOD,
      comparisonPeriod: null,
      scopeLabel: "RCO Tecnologia",
      issuedAt: "2026-08-03",
      renderers: { dre: BLOCK_RENDERERS.dre },
    });

    expect(report.skippedBlocks).toEqual(["bank-balances", "counterparties"]);
    expect(report.blob.size).toBeGreaterThan(0);
  });

  it("não duplica tipo repetido na lista de ignorados", async () => {
    const report = await generateReportPdf({
      config: configWith([createBlock("bank-balances", "a"), createBlock("bank-balances", "b")]),
      data: emptyReportData(),
      period: PERIOD,
      comparisonPeriod: null,
      scopeLabel: "RCO Tecnologia",
      issuedAt: "2026-08-03",
      renderers: {},
    });

    expect(report.skippedBlocks).toEqual(["bank-balances"]);
  });

  it("ignora quebra de página no topo da página", async () => {
    const withBreak = await generate([createBlock("page-break", "pb1"), createBlock("dre", "d1")], {
      dre: [dreRow()],
    });

    expect(withBreak.pageCount).toBe(1);
  });

  it("respeita a quebra de página entre dois blocos", async () => {
    const report = await generate(
      [createBlock("dre", "d1"), createBlock("page-break", "pb1"), createBlock("dre", "d2")],
      { dre: [dreRow()] },
    );

    expect(report.pageCount).toBe(2);
  });

  it("gera relatório vazio sem bloco algum", async () => {
    const report = await generate([], { dre: null });

    expect(report.pageCount).toBe(1);
    expect(report.blob.size).toBeGreaterThan(0);
  });

  it("respeita a coluna de caixa desligada", async () => {
    const report = await generateReportPdf({
      config: configWith([
        { instanceId: "d1", type: "dre", options: { includeCashColumn: false } },
      ]),
      data: { ...emptyReportData(), dre: [dreRow()] },
      period: PERIOD,
      comparisonPeriod: null,
      scopeLabel: "RCO Tecnologia",
      issuedAt: "2026-08-03",
    });

    expect(report.blob.size).toBeGreaterThan(0);
  });
});

describe("buildFilename", () => {
  it("remove acentos e normaliza o título", () => {
    expect(buildFilename("Relatório Gerencial", PERIOD)).toBe(
      "relatorio-gerencial-2026-07-01_2026-07-31.pdf",
    );
  });

  it("colapsa pontuação em hífen único", () => {
    expect(buildFilename("DRE — Diretoria / 2026", PERIOD)).toBe(
      "dre-diretoria-2026-2026-07-01_2026-07-31.pdf",
    );
  });

  it("usa fallback quando o título não tem caractere aproveitável", () => {
    expect(buildFilename("···", PERIOD)).toBe("relatorio-2026-07-01_2026-07-31.pdf");
  });
});
