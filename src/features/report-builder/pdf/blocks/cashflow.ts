/**
 * Fluxo de caixa — entradas, saídas e saldo acumulado.
 *
 * A granularidade (mensal ou diária) vem da opção do bloco e determina tanto a
 * consulta quanto o rótulo das categorias.
 */
import { withCumulativeBalance } from "@/features/cashflow/compute";
import { formatBRL } from "@/lib/format";

import { drawBarChart } from "../charts/bar";
import { dayCategory, monthCategory } from "../charts/format";
import type { BlockRenderer } from "../driver";
import { CHART_HEIGHT, COLORS, CONTENT } from "../reportTheme";
import { renderChartBlock } from "./chartBlock";
import { drawDataTable, MIN_TABLE_PRESENCE_MM } from "./table";

export const renderCashflow: BlockRenderer = (ctx, block) => {
  const cashflow = ctx.data.cashflow;
  const rows = cashflow?.rows ?? [];
  const heading = block.options.heading ?? "Fluxo de caixa";
  const label = (bucket: string) =>
    cashflow?.granularity === "daily" ? dayCategory(bucket) : monthCategory(bucket);

  renderChartBlock(ctx, {
    heading,
    eyebrow: ctx.period.label,
    chartHeightMm: block.options.showTable === true ? CHART_HEIGHT.compact : CHART_HEIGHT.full,
    hasData: rows.length > 0,
    emptyMessage:
      ctx.config.scope.mode === "consolidated"
        ? "Fluxo de caixa não tem versão consolidada — selecione uma empresa."
        : "Sem movimentação no período.",
    draw: (frame) => {
      drawBarChart(ctx.doc, {
        frame,
        categories: rows.map((row) => label(row.bucket)),
        series: [
          { label: "Entradas", color: COLORS.income, values: rows.map((r) => r.inflow) },
          { label: "Saídas", color: COLORS.expense, values: rows.map((r) => -Math.abs(r.outflow)) },
        ],
        showLegend: true,
      });
    },
  });

  if (block.options.showTable !== true || rows.length === 0) return;

  const withBalance = withCumulativeBalance(rows, 0);
  const startY = ctx.cursor.reserve(MIN_TABLE_PRESENCE_MM);

  drawDataTable(ctx, startY, {
    head: [["Período", "Entradas", "Saídas", "Líquido", "Acumulado"]],
    body: withBalance.map((row) => [
      label(row.bucket),
      formatBRL(row.inflow),
      formatBRL(-Math.abs(row.outflow)),
      formatBRL(row.net),
      formatBRL(row.cumulative),
    ]),
    columns: [
      { width: CONTENT.widthMm - 4 * 32 },
      { width: 32, align: "right" },
      { width: 32, align: "right" },
      { width: 32, align: "right" },
      { width: 32, align: "right" },
    ],
    cellTextColor: (rowIndex, columnIndex) => {
      const row = withBalance[rowIndex];
      if (row == null) return undefined;
      if (columnIndex === 2) return COLORS.expense;
      if (columnIndex === 3 && row.net < 0) return COLORS.expense;
      if (columnIndex === 4 && row.cumulative < 0) return COLORS.expense;
      return undefined;
    },
  });
};
