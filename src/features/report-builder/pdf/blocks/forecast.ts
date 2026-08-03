/**
 * Forecast de caixa — projeção de saldo a partir de contas a pagar/receber e
 * recorrências.
 *
 * Horizonte fixo de 90 dias a partir da emissão, **independente do período do
 * relatório**: é uma projeção para frente, não uma análise do período fechado.
 */
import { dayCategory } from "../charts/format";
import { drawLineChart } from "../charts/line";
import type { BlockRenderer } from "../driver";
import { CHART_HEIGHT, COLORS } from "../reportTheme";
import { renderChartBlock } from "./chartBlock";

export const renderForecast: BlockRenderer = (ctx, block) => {
  const rows = ctx.data.forecast ?? [];
  const heading = block.options.heading ?? "Projeção de caixa — 90 dias";

  renderChartBlock(ctx, {
    heading,
    eyebrow: "a partir da emissão",
    chartHeightMm: CHART_HEIGHT.full,
    hasData: rows.length > 0,
    emptyMessage:
      ctx.config.scope.mode === "consolidated"
        ? "Projeção não tem versão consolidada — selecione uma empresa."
        : "Sem contas previstas nos próximos 90 dias.",
    draw: (frame) => {
      drawLineChart(ctx.doc, {
        frame,
        categories: rows.map((row) => dayCategory(row.day)),
        series: [
          {
            label: "Saldo projetado",
            color: COLORS.accent,
            values: rows.map((row) => row.runningBalance),
          },
        ],
        area: true,
        showLegend: false,
      });
    },
  });
};
