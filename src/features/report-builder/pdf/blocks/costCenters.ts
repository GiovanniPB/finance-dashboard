/**
 * Centros de custo — receita, despesa e margem por centro.
 *
 * O gráfico compara o resultado líquido de cada centro; a tabela traz a abertura.
 * Com o gráfico desligado, a tabela assume o título do bloco.
 */
import { formatBRL, formatPercent } from "@/lib/format";

import { drawBarChart } from "../charts/bar";
import type { BlockRenderer } from "../driver";
import { CHART_HEIGHT, COLORS, CONTENT } from "../reportTheme";
import { renderChartBlock, renderEmptyBlock } from "./chartBlock";
import {
  drawDataTable,
  MIN_TABLE_PRESENCE_MM,
  renderTableBlock,
  type DataTableOptions,
} from "./table";

/** Máximo de centros no gráfico — além disso os rótulos ficam ilegíveis. */
const MAX_CHART_BARS = 12;

export const renderCostCenters: BlockRenderer = (ctx, block) => {
  const rows = ctx.data.costCenters ?? [];
  const heading = block.options.heading ?? "Centros de custo";
  const showChart = block.options.showChart !== false;

  if (rows.length === 0) {
    renderEmptyBlock(
      ctx,
      heading,
      ctx.period.label,
      ctx.config.scope.mode === "consolidated"
        ? "Centros de custo não têm versão consolidada — selecione uma empresa."
        : "Sem movimentação por centro de custo no período.",
    );
    return;
  }

  const table: DataTableOptions = {
    head: [["Código", "Centro de custo", "Receita", "Despesa", "Resultado", "Margem"]],
    body: rows.map((row) => [
      row.code,
      row.name,
      formatBRL(row.revenue),
      formatBRL(-Math.abs(row.expense)),
      formatBRL(row.net),
      row.marginPct == null ? "—" : formatPercent(row.marginPct, { fromHundred: true }),
    ]),
    columns: [
      { width: 18 },
      { width: CONTENT.widthMm - 18 - 4 * 28 },
      { width: 28, align: "right" },
      { width: 28, align: "right" },
      { width: 28, align: "right" },
      { width: 28, align: "right" },
    ],
    cellTextColor: (rowIndex, columnIndex) => {
      const row = rows[rowIndex];
      if (row == null) return undefined;
      if (columnIndex === 3) return COLORS.expense;
      if (columnIndex === 4 && row.net < 0) return COLORS.expense;
      return undefined;
    },
  };

  if (!showChart) {
    renderTableBlock(ctx, { ...table, heading, eyebrow: ctx.period.label });
    return;
  }

  const charted = rows.slice(0, MAX_CHART_BARS);
  renderChartBlock(ctx, {
    heading,
    eyebrow: ctx.period.label,
    chartHeightMm: CHART_HEIGHT.compact,
    hasData: true,
    draw: (frame) => {
      drawBarChart(ctx.doc, {
        frame,
        categories: charted.map((row) => (row.code === "" ? row.name : row.code)),
        series: [
          { label: "Resultado", color: COLORS.accent, values: charted.map((row) => row.net) },
        ],
        showLegend: false,
      });
    },
  });

  drawDataTable(ctx, ctx.cursor.reserve(MIN_TABLE_PRESENCE_MM), table);
};
