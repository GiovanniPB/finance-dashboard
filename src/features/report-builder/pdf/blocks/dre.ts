/**
 * DRE — tabela longa que pagina sozinha.
 *
 * O `autoTable` repete o cabeçalho a cada página e respeita as margens de
 * cabeçalho/rodapé; ao terminar, sincronizamos o cursor com a posição real
 * (`syncTo`) porque ele não tem como prever quantas páginas a tabela consumiu.
 */
import { autoTable } from "jspdf-autotable";

import type { DreComputedRow } from "@/features/dre/types";
import { formatBRL } from "@/lib/format";

import { lastTableY, type BlockRenderer } from "../driver";
import { drawText, lineHeightMm } from "../primitives";
import { COLORS, CONTENT, FONT_SIZE, PAGE, SPACING } from "../reportTheme";
import { drawBlockHeading } from "./shared";

/**
 * Indentação por profundidade da conta. NBSP (U+00A0) e não espaço comum: o
 * `overflow: "linebreak"` do autoTable apara espaço em branco à esquerda. NBSP
 * existe em WinAnsi (0xA0), então a fonte embutida do jsPDF o representa.
 */
const INDENT = "\u00A0\u00A0\u00A0";

const CODE_WIDTH_MM = 18;
const VALUE_WIDTH_MM = 30;

/**
 * Mínimo de tabela que deve caber junto do título para não deixar um título
 * órfão no pé da página (cabeçalho + ~2 linhas).
 */
const MIN_TABLE_PRESENCE_MM = 18;

/** Índice da coluna de competência no corpo montado. */
const ACCRUAL_COLUMN = 2;
const CASH_COLUMN = 3;

export const renderDre: BlockRenderer = (ctx, block) => {
  const { doc, cursor, data, period } = ctx;
  const rows = data.dre;
  const includeCash = block.options.includeCashColumn ?? true;
  const heading = block.options.heading ?? "Demonstrativo de resultado";

  if (rows == null || rows.length === 0) {
    renderEmpty(ctx, heading, period.label);
    return;
  }

  const titleHeight = drawBlockHeading(ctx, heading, period.label);
  const startY = cursor.reserve(titleHeight + MIN_TABLE_PRESENCE_MM) + titleHeight;

  autoTable(doc, {
    head: buildDreTableHead(includeCash),
    body: buildDreTableBody(rows, includeCash),
    startY,
    margin: {
      left: PAGE.margin.left,
      right: PAGE.margin.right,
      top: CONTENT.topWithHeaderMm,
      bottom: PAGE.margin.bottom + PAGE.footerHeightMm,
    },
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: FONT_SIZE.tableBody,
      cellPadding: { top: 1.4, bottom: 1.4, left: 1.6, right: 1.6 },
      textColor: COLORS.text,
      lineColor: COLORS.border,
      lineWidth: 0,
      overflow: "linebreak",
    },
    headStyles: {
      fontStyle: "bold",
      fontSize: FONT_SIZE.tableHeader,
      textColor: COLORS.textMuted,
      fillColor: COLORS.surfaceAlt,
      lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 },
      lineColor: COLORS.borderStrong,
    },
    columnStyles: buildColumnStyles(includeCash),
    didParseCell: (hook) => {
      // `columnStyles.halign` do autoTable v5 não alcança a linha de cabeçalho,
      // então os títulos das colunas monetárias precisam ser alinhados aqui —
      // sem isso ficam à esquerda sobre valores alinhados à direita.
      if (hook.section === "head") {
        if (isValueColumn(hook.column.index, includeCash)) {
          hook.cell.styles.halign = "right";
        }
        return;
      }
      if (hook.section !== "body") return;
      const row = rows[hook.row.index];
      if (row == null) return;

      if (row.is_summary) {
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.fillColor = COLORS.surfaceAlt;
        hook.cell.styles.lineWidth = { top: 0.2, right: 0, bottom: 0, left: 0 };
        hook.cell.styles.lineColor = COLORS.border;
      }

      const value = valueForColumn(row, hook.column.index, includeCash);
      if (value != null && value < 0) {
        hook.cell.styles.textColor = COLORS.expense;
      }
    },
  });

  cursor.syncTo(doc.getNumberOfPages(), lastTableY(doc, startY));
  cursor.advance(SPACING.blockGap);
};

function renderEmpty(
  ctx: Parameters<BlockRenderer>[0],
  heading: string,
  periodLabel: string,
): void {
  const { doc, cursor } = ctx;
  const titleHeight = drawBlockHeading(ctx, heading, periodLabel);
  const messageHeight = lineHeightMm(FONT_SIZE.body);
  const y = cursor.take(titleHeight + messageHeight + SPACING.blockGap);
  drawText(doc, "Sem lançamentos no período.", CONTENT.leftMm, y + titleHeight, {
    size: FONT_SIZE.body,
    color: COLORS.textMuted,
  });
}

function isValueColumn(columnIndex: number, includeCash: boolean): boolean {
  return columnIndex === ACCRUAL_COLUMN || (includeCash && columnIndex === CASH_COLUMN);
}

/** Valor numérico da coluna, ou `null` se a coluna não é monetária. */
function valueForColumn(
  row: DreComputedRow,
  columnIndex: number,
  includeCash: boolean,
): number | null {
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
  return rows.map((row) => {
    const name = INDENT.repeat(row.depth) + row.name;
    return includeCash
      ? [row.code, name, formatBRL(row.effective_total), formatBRL(row.effective_total_cash)]
      : [row.code, name, formatBRL(row.effective_total)];
  });
}

interface ColumnStyle {
  cellWidth: number;
  halign?: "left" | "right";
}

export function buildColumnStyles(includeCash: boolean): Record<string, ColumnStyle> {
  const nameWidth = CONTENT.widthMm - CODE_WIDTH_MM - VALUE_WIDTH_MM * (includeCash ? 2 : 1);

  const styles: Record<string, ColumnStyle> = {
    0: { cellWidth: CODE_WIDTH_MM },
    1: { cellWidth: nameWidth },
    2: { cellWidth: VALUE_WIDTH_MM, halign: "right" },
  };
  if (includeCash) styles["3"] = { cellWidth: VALUE_WIDTH_MM, halign: "right" };
  return styles;
}
