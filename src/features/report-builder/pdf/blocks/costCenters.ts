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
import { formatOutflow, isNegativeValue } from "./shared";
import {
  drawDataTable,
  MIN_TABLE_PRESENCE_MM,
  renderTableBlock,
  type DataTableOptions,
} from "./table";

/** Máximo de centros no gráfico — além disso os rótulos ficam ilegíveis. */
const MAX_CHART_BARS = 12;

/**
 * Nome de centro de custo é livre e costuma ser longo ('OTM CORRETORA - RENDIMENTOS
 * APLIC'). No eixo do gráfico, rótulo largo demais faz o `drawAxes` pular categorias
 * para caber — então encurta aqui, que a tabela logo abaixo traz o nome inteiro.
 */
const MAX_CHART_LABEL_CHARS = 16;

function chartLabel(name: string): string {
  return name.length <= MAX_CHART_LABEL_CHARS
    ? name
    : `${name.slice(0, MAX_CHART_LABEL_CHARS - 1).trimEnd()}…`;
}

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
    head: [["Centro de custo", "Receita", "Despesa", "Resultado", "Margem"]],
    body: rows.map((row) => [
      row.name,
      formatBRL(row.revenue),
      formatOutflow(row.expense),
      formatBRL(row.net),
      row.marginPct == null ? "—" : formatPercent(row.marginPct, { fromHundred: true }),
    ]),
    columns: [
      { width: CONTENT.widthMm - 4 * 28 },
      { width: 28, align: "right" },
      { width: 28, align: "right" },
      { width: 28, align: "right" },
      { width: 28, align: "right" },
    ],
    cellTextColor: (rowIndex, columnIndex) => {
      const row = rows[rowIndex];
      if (row == null) return undefined;
      if (columnIndex === 2) return row.expense === 0 ? undefined : COLORS.expense;
      if (columnIndex === 3 && isNegativeValue(row.net)) return COLORS.expense;
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
        categories: charted.map((row) => chartLabel(row.name)),
        series: [
          { label: "Resultado", color: COLORS.accent, values: charted.map((row) => row.net) },
        ],
        showLegend: false,
      });
    },
  });

  drawDataTable(ctx, ctx.cursor.reserve(MIN_TABLE_PRESENCE_MM), table);
};
