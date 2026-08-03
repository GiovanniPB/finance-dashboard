/**
 * Gráfico de barras agrupadas (1 a 3 séries por categoria).
 *
 * Barras nascem sempre na linha do zero, inclusive com valores negativos —
 * barra que não parte do zero distorce a comparação visual.
 */
import type { jsPDF } from "jspdf";

import { drawFilledRect } from "../primitives";
import { drawAxes, type ChartFrame } from "./frame";
import { drawLegend, legendHeightMm, type LegendItem } from "./legend";
import { extentOf, niceScale } from "./scale";

export interface ChartSeries {
  label: string;
  color: string;
  /** `null` = sem dado nessa categoria — não desenha, e não conta como zero. */
  values: readonly (number | null)[];
}

export interface BarChartOptions {
  frame: ChartFrame;
  categories: readonly string[];
  series: readonly ChartSeries[];
  showLegend?: boolean;
  formatValue?: (value: number) => string;
}

/** Largura máxima de uma barra — evita barras obesas com poucas categorias. */
const MAX_BAR_WIDTH_MM = 12;
const BAR_GAP_MM = 0.6;

export function drawBarChart(doc: jsPDF, options: BarChartOptions): void {
  const { frame, categories, series } = options;
  if (series.length === 0 || categories.length === 0) return;

  const showLegend = (options.showLegend ?? series.length > 1) && series.length > 0;
  const legendHeight = showLegend ? legendHeightMm() : 0;

  const extent = extentOf(series.map((s) => s.values));
  const scale = niceScale(extent.min, extent.max, { includeZero: true });

  const plot = drawAxes(doc, {
    frame,
    scale,
    categories,
    legendHeightMm: legendHeight,
    formatValue: options.formatValue,
  });

  if (showLegend) {
    const items: LegendItem[] = series.map((s) => ({ label: s.label, color: s.color }));
    drawLegend(doc, items, plot.xMm, frame.yMm);
  }

  const totalGap = BAR_GAP_MM * (series.length - 1);
  const barWidth = Math.min(MAX_BAR_WIDTH_MM, (plot.bands.innerWidth - totalGap) / series.length);
  const groupWidth = barWidth * series.length + totalGap;

  categories.forEach((_, categoryIndex) => {
    const groupStart = plot.bands.center(categoryIndex) - groupWidth / 2;

    series.forEach((serie, serieIndex) => {
      const value = serie.values[categoryIndex];
      if (value == null || !Number.isFinite(value)) return;

      const y = plot.valueToY(value);
      const height = Math.abs(y - plot.baselineYMm);
      if (height <= 0) return;

      drawFilledRect(
        doc,
        groupStart + serieIndex * (barWidth + BAR_GAP_MM),
        Math.min(y, plot.baselineYMm),
        barWidth,
        height,
        serie.color,
      );
    });
  });
}
