/**
 * Despesas por categoria — rosca com legenda em coluna.
 *
 * A legenda da rosca já traz valor e percentual, então a tabela (`showTable`) é
 * complemento opcional, não a fonte primária da informação.
 */
import { formatBRL } from "@/lib/format";

import { drawDonutChart, type DonutSlice } from "../charts/donut";
import type { BlockRenderer } from "../driver";
import { CHART_HEIGHT, COLORS, CONTENT, NEUTRAL_SERIES, SERIES_PALETTE } from "../reportTheme";
import { renderChartBlock } from "./chartBlock";
import { drawDataTable, MIN_TABLE_PRESENCE_MM } from "./table";

export const renderExpenseBreakdown: BlockRenderer = (ctx, block) => {
  const rows = ctx.data.expenses ?? [];
  const heading = block.options.heading ?? "Despesas por categoria";

  renderChartBlock(ctx, {
    heading,
    eyebrow: ctx.period.label,
    chartHeightMm: CHART_HEIGHT.donut,
    hasData: rows.length > 0,
    emptyMessage: "Sem despesas no período.",
    draw: (frame) => {
      const slices: DonutSlice[] = rows.map((row, i) => ({
        label: row.account_name,
        value: Math.abs(row.total),
        // "Outros" é agregado, não categoria real — sempre o cinza neutro.
        color: row.is_other
          ? NEUTRAL_SERIES
          : (SERIES_PALETTE[i % SERIES_PALETTE.length] ?? COLORS.accent),
      }));
      drawDonutChart(ctx.doc, { frame, slices });
    },
  });

  if (block.options.showTable !== true || rows.length === 0) return;

  const total = rows.reduce((acc, row) => acc + Math.abs(row.total), 0);
  const startY = ctx.cursor.reserve(MIN_TABLE_PRESENCE_MM);

  drawDataTable(ctx, startY, {
    head: [["Conta", "Valor", "% do total"]],
    body: rows.map((row) => [
      row.account_name,
      formatBRL(Math.abs(row.total)),
      formatShare(Math.abs(row.total), total),
    ]),
    foot: [["Total", formatBRL(total), "100,0%"]],
    columns: [
      { width: CONTENT.widthMm - 70 },
      { width: 40, align: "right" },
      { width: 30, align: "right" },
    ],
  });
};

function formatShare(value: number, total: number): string {
  if (total === 0) return "—";
  return `${((value / total) * 100).toFixed(1).replace(".", ",")}%`;
}
