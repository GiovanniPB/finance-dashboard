/**
 * Tabela de dados padrão do relatório.
 *
 * Centraliza o estilo e, principalmente, a correção descoberta na Fase 1: o
 * `columnStyles.halign` do autoTable v5 **não alcança a linha de cabeçalho**, de
 * modo que colunas numéricas ficariam com título à esquerda sobre valores à
 * direita. O alinhamento do cabeçalho é aplicado em `didParseCell`, num só lugar.
 */
import { autoTable } from "jspdf-autotable";

import { lastTableY, type BlockRenderer } from "../driver";
import { COLORS, CONTENT, FONT_SIZE, PAGE, SPACING } from "../reportTheme";
import { BLOCK_HEADING_HEIGHT_MM, drawBlockHeading } from "./shared";

export interface TableColumn {
  /** Largura em mm. */
  width: number;
  align?: "left" | "right";
}

export interface DataTableOptions {
  head: string[][];
  body: string[][];
  foot?: string[][];
  columns: readonly TableColumn[];
  /** Índices de linha do corpo tratados como somatório (negrito + fundo). */
  summaryRows?: ReadonlySet<number>;
  /** Cor de texto por célula — usado para negativos. */
  cellTextColor?: (rowIndex: number, columnIndex: number) => string | undefined;
  /** Indentação em mm por linha do corpo, para hierarquias. */
  rowIndentMm?: (rowIndex: number) => number;
}

/**
 * Mínimo de tabela que deve caber junto do título para não deixar título órfão
 * no pé da página (cabeçalho + ~2 linhas).
 */
export const MIN_TABLE_PRESENCE_MM = 18;

export function drawDataTable(
  ctx: Parameters<BlockRenderer>[0],
  startY: number,
  options: DataTableOptions,
): void {
  const { doc, cursor } = ctx;
  const columnStyles: Record<string, { cellWidth: number; halign?: "left" | "right" }> = {};
  options.columns.forEach((column, index) => {
    columnStyles[String(index)] = {
      cellWidth: column.width,
      ...(column.align === "right" ? { halign: "right" as const } : {}),
    };
  });

  autoTable(doc, {
    head: options.head,
    body: options.body,
    ...(options.foot == null ? {} : { foot: options.foot }),
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
    footStyles: {
      fontStyle: "bold",
      fontSize: FONT_SIZE.tableBody,
      textColor: COLORS.text,
      fillColor: COLORS.surfaceAlt,
      lineWidth: { top: 0.2, right: 0, bottom: 0, left: 0 },
      lineColor: COLORS.borderStrong,
    },
    columnStyles,
    didParseCell: (hook) => {
      // `columnStyles.halign` do autoTable v5 não alcança nem o cabeçalho nem o
      // rodapé — sem isto o total fica desalinhado da coluna que ele soma.
      if (hook.section === "head" || hook.section === "foot") {
        const align = options.columns[hook.column.index]?.align;
        if (align === "right") hook.cell.styles.halign = "right";
        return;
      }
      if (hook.section !== "body") return;

      const rowIndex = hook.row.index;

      if (options.summaryRows?.has(rowIndex) === true) {
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.fillColor = COLORS.surfaceAlt;
        hook.cell.styles.lineWidth = { top: 0.2, right: 0, bottom: 0, left: 0 };
        hook.cell.styles.lineColor = COLORS.border;
      }

      const indent = options.rowIndentMm?.(rowIndex);
      if (indent != null && indent > 0 && hook.column.index === 0) {
        hook.cell.styles.cellPadding = { top: 1.4, bottom: 1.4, left: 1.6 + indent, right: 1.6 };
      }

      const color = options.cellTextColor?.(rowIndex, hook.column.index);
      if (color != null) hook.cell.styles.textColor = color;
    },
  });

  cursor.syncTo(doc.getNumberOfPages(), lastTableY(doc, startY));
  cursor.advance(SPACING.blockGap);
}

export interface TableBlockOptions extends DataTableOptions {
  heading: string;
  eyebrow: string;
}

/** Título + tabela, reservados juntos. Espelha `renderChartBlock`. */
export function renderTableBlock(
  ctx: Parameters<BlockRenderer>[0],
  options: TableBlockOptions,
): void {
  const startY =
    ctx.cursor.reserve(BLOCK_HEADING_HEIGHT_MM + MIN_TABLE_PRESENCE_MM) + BLOCK_HEADING_HEIGHT_MM;
  drawBlockHeading(ctx, options.heading, options.eyebrow);
  drawDataTable(ctx, startY, options);
}
