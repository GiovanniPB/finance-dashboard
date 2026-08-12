/**
 * Corte do bloco de DRE no Resultado Líquido.
 *
 * O filtro é testado nas duas pontas: na função pura e no PDF gerado — uma
 * DRE longa só com contas abaixo da linha não pode paginar, porque nenhuma
 * linha dela deveria chegar à tabela.
 */
import { describe, expect, it } from "vitest";

import type { DreComputedRow } from "@/features/dre/types";

import { createBlock } from "../../blocks/catalog";
import { emptyReportData, type ReportData } from "../../data/types";
import type { ResolvedPeriod } from "../../period";
import { emptyReportConfig, type ReportBlock } from "../../schema";
import { generateReportPdf } from "../jsPdfDriver";
import { buildDreTableBody, rowsUpToNetResult } from "./dre";

const ORG = "00000000-0000-0000-0000-000000000001";
const COMPANY = "11111111-1111-1111-1111-111111111111";
const PERIOD: ResolvedPeriod = { from: "2026-07-01", to: "2026-07-31", label: "julho de 2026" };

function dreRow(partial: Partial<DreComputedRow> = {}): DreComputedRow {
  return {
    account_id: partial.account_id ?? "acc",
    parent_id: partial.parent_id ?? null,
    code: partial.code ?? "1.01",
    name: partial.name ?? "Conta de teste",
    kind: partial.kind ?? "operating_expense",
    dre_section: partial.dre_section ?? null,
    is_summary: partial.is_summary ?? false,
    below_the_line: partial.below_the_line ?? false,
    sign_hint: partial.sign_hint ?? null,
    sort_order: partial.sort_order ?? 0,
    total: partial.total ?? 0,
    total_cash: partial.total_cash ?? 0,
    effective_total: partial.effective_total ?? 1_000,
    effective_total_cash: partial.effective_total_cash ?? 900,
    depth: partial.depth ?? 0,
  };
}

/** Plano de contas resumido: 1 → 8 acima da linha, 9.xx abaixo. */
function chartFixture(): DreComputedRow[] {
  return [
    dreRow({
      account_id: "1",
      code: "1",
      name: "(+) Venda Bruta",
      is_summary: true,
      sort_order: 100,
    }),
    dreRow({
      account_id: "8",
      code: "8",
      name: "(=) Resultado Líquido (RL)",
      is_summary: true,
      sort_order: 800,
    }),
    dreRow({
      account_id: "9.01",
      code: "9.01",
      name: "Distribuição de Dividendos",
      below_the_line: true,
      sort_order: 900,
    }),
    dreRow({
      account_id: "9.07",
      code: "9.07",
      name: "Saldo Final do Período",
      is_summary: true,
      below_the_line: true,
      sort_order: 960,
    }),
  ];
}

function generate(blocks: ReportBlock[], data: Partial<ReportData>) {
  const base = emptyReportConfig({ organizationId: ORG, companyId: COMPANY, mode: "company" });
  return generateReportPdf({
    config: { ...base, blocks },
    data: { ...emptyReportData(), ...data },
    period: PERIOD,
    comparisonPeriod: null,
    scopeLabel: "RCO Tecnologia",
    issuedAt: "2026-08-03",
  });
}

describe("rowsUpToNetResult", () => {
  it("mantém as contas até o resultado líquido e descarta o grupo 9", () => {
    const kept = rowsUpToNetResult(chartFixture());

    expect(kept.map((row) => row.code)).toEqual(["1", "8"]);
  });

  it("preserva a ordem original das contas mantidas", () => {
    const rows = [
      dreRow({ account_id: "a", code: "3", sort_order: 300 }),
      dreRow({ account_id: "b", code: "9.05", below_the_line: true, sort_order: 940 }),
      dreRow({ account_id: "c", code: "5", sort_order: 500 }),
    ];

    expect(rowsUpToNetResult(rows).map((row) => row.code)).toEqual(["3", "5"]);
  });

  it("devolve lista vazia quando toda a DRE está abaixo da linha", () => {
    const rows = [dreRow({ code: "9.01", below_the_line: true })];

    expect(rowsUpToNetResult(rows)).toEqual([]);
  });

  it("não muta a lista recebida", () => {
    const rows = chartFixture();

    rowsUpToNetResult(rows);

    expect(rows).toHaveLength(4);
  });

  it("alimenta o corpo da tabela só com as contas acima da linha", () => {
    const body = buildDreTableBody(rowsUpToNetResult(chartFixture()), true);

    expect(body.map(([code]) => code)).toEqual(["1", "8"]);
  });
});

describe("bloco de DRE no PDF", () => {
  it("não pagina uma DRE longa formada só por contas abaixo da linha", async () => {
    const rows = Array.from({ length: 220 }, (_, i) =>
      dreRow({ account_id: `b${i}`, code: `9.${i}`, name: `Capital ${i}`, below_the_line: true }),
    );

    const report = await generate([createBlock("dre", "d1")], { dre: rows });

    expect(report.pageCount).toBe(1);
    expect(report.skippedBlocks).toEqual([]);
  });

  it("ainda pagina uma DRE longa acima da linha", async () => {
    const rows = Array.from({ length: 220 }, (_, i) =>
      dreRow({ account_id: `a${i}`, code: `6.2.${i}`, name: `Conta ${i}` }),
    );

    const report = await generate([createBlock("dre", "d1")], { dre: rows });

    expect(report.pageCount).toBeGreaterThan(2);
  });
});
