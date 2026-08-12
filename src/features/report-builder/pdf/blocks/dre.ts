/**
 * DRE — tabela longa que pagina sozinha (o `autoTable` repete o cabeçalho).
 *
 * A hierarquia de contas é indentada por **padding da célula**, não por espaços:
 * espaço em branco à esquerda é aparado pelo `overflow: "linebreak"`, e NBSP
 * dependeria da largura do glifo na fonte.
 *
 * O demonstrativo exportado vai **até o Resultado Líquido** (conta 8). O grupo 9
 * — dividendos, bônus, reembolsos e saldos — é movimentação de capital abaixo da
 * linha, não compõe o resultado, e fica fora do relatório.
 */
import type { DreComputedRow } from "@/features/dre/types";
import { formatBRL } from "@/lib/format";

import type { BlockRenderer } from "../driver";
import { COLORS, CONTENT } from "../reportTheme";
import { renderEmptyBlock } from "./chartBlock";
import { renderTableBlock, type TableColumn } from "./table";

const CODE_WIDTH_MM = 18;
const VALUE_WIDTH_MM = 30;
/** Recuo por nível de profundidade da conta. */
const INDENT_PER_DEPTH_MM = 3;

export const renderDre: BlockRenderer = (ctx, block) => {
  const rows = ctx.data.dre == null ? null : rowsUpToNetResult(ctx.data.dre);
  const includeCash = block.options.includeCashColumn ?? true;
  const heading = block.options.heading ?? "Demonstrativo de resultado";

  if (rows == null || rows.length === 0) {
    renderEmptyBlock(ctx, heading, ctx.period.label, "Sem lançamentos no período.");
    return;
  }

  const summaryRows = new Set(
    rows.map((row, i) => (row.is_summary ? i : -1)).filter((i) => i >= 0),
  );

  renderTableBlock(ctx, {
    heading,
    eyebrow: ctx.period.label,
    head: buildDreTableHead(includeCash),
    body: buildDreTableBody(rows, includeCash),
    columns: buildDreColumns(includeCash),
    summaryRows,
    rowIndentMm: (rowIndex) => (rows[rowIndex]?.depth ?? 0) * INDENT_PER_DEPTH_MM,
    cellTextColor: (rowIndex, columnIndex) => {
      const value = valueForColumn(rows[rowIndex], columnIndex, includeCash);
      return value != null && value < 0 ? COLORS.expense : undefined;
    },
  });
};

/**
 * Corta o demonstrativo no Resultado Líquido, removendo as contas abaixo da
 * linha (grupo 9). Usa a flag `below_the_line` do plano de contas em vez do
 * prefixo do código: é a mesma marca que a DRE da tela e o cálculo do saldo
 * corrido já respeitam, e sobrevive a uma renumeração do plano.
 */
export function rowsUpToNetResult(rows: DreComputedRow[]): DreComputedRow[] {
  return rows.filter((row) => !row.below_the_line);
}

/** Índices das colunas monetárias no corpo montado. */
const ACCRUAL_COLUMN = 2;
const CASH_COLUMN = 3;

function valueForColumn(
  row: DreComputedRow | undefined,
  columnIndex: number,
  includeCash: boolean,
): number | null {
  if (row == null) return null;
  if (columnIndex === ACCRUAL_COLUMN) return row.effective_total;
  if (includeCash && columnIndex === CASH_COLUMN) return row.effective_total_cash;
  return null;
}

export function buildDreTableHead(includeCash: boolean): string[][] {
  return includeCash
    ? [["Código", "Conta", "Competência", "Caixa"]]
    : [["Código", "Conta", "Competência"]];
}

export function buildDreTableBody(rows: DreComputedRow[], includeCash: boolean): string[][] {
  return rows.map((row) =>
    includeCash
      ? [row.code, row.name, formatBRL(row.effective_total), formatBRL(row.effective_total_cash)]
      : [row.code, row.name, formatBRL(row.effective_total)],
  );
}

export function buildDreColumns(includeCash: boolean): TableColumn[] {
  const valueColumns = includeCash ? 2 : 1;
  const nameWidth = CONTENT.widthMm - CODE_WIDTH_MM - VALUE_WIDTH_MM * valueColumns;

  const columns: TableColumn[] = [
    { width: CODE_WIDTH_MM },
    { width: nameWidth },
    { width: VALUE_WIDTH_MM, align: "right" },
  ];
  if (includeCash) columns.push({ width: VALUE_WIDTH_MM, align: "right" });
  return columns;
}
