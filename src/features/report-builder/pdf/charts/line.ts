/**
 * Gráfico de linha, com preenchimento de área opcional.
 *
 * Usado em acumulados (receita YoY), fluxo de caixa e forecast. Séries com
 * `area` são desenhadas antes das linhas para não cobrir os traços.
 */
import type { jsPDF } from "jspdf";

import type { ChartSeries } from "./bar";
import { drawAxes, type ChartFrame, type PlotArea } from "./frame";
import { areaPolygon, fillPolygon, strokePolyline, type Point } from "./geometry";
import { drawLegend, legendHeightMm, type LegendItem } from "./legend";
import { extentOf, niceScale } from "./scale";

export interface LineChartOptions {
  frame: ChartFrame;
  categories: readonly string[];
  series: readonly ChartSeries[];
  /** Preencher a área sob a linha. */
  area?: boolean;
  showLegend?: boolean;
  formatValue?: (value: number) => string;
  /** Deixar o domínio respirar em vez de forçar o zero (saldos altos). */
  includeZero?: boolean;
}

/** Opacidade simulada da área: jsPDF não tem alpha simples, então clareamos a cor. */
const AREA_TINT = 0.18;

export function drawLineChart(doc: jsPDF, options: LineChartOptions): void {
  const { frame, categories, series } = options;
  if (series.length === 0 || categories.length === 0) return;

  const showLegend = options.showLegend ?? series.length > 1;
  const legendHeight = showLegend ? legendHeightMm() : 0;

  const extent = extentOf(series.map((s) => s.values));
  const scale = niceScale(extent.min, extent.max, {
    includeZero: options.includeZero ?? true,
  });

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

  const pointsBySeries = series.map((serie) => seriePoints(serie, plot, categories.length));

  if (options.area === true) {
    series.forEach((serie, i) => {
      const points = pointsBySeries[i];
      if (points == null || points.length < 2) return;
      fillPolygon(doc, areaPolygon(points, plot.baselineYMm), tint(serie.color, AREA_TINT));
    });
  }

  series.forEach((serie, i) => {
    const points = pointsBySeries[i];
    if (points == null || points.length < 2) return;
    strokePolyline(doc, points, serie.color, 0.5);
  });
}

function seriePoints(serie: ChartSeries, plot: PlotArea, count: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const value = serie.values[i];
    if (value == null || !Number.isFinite(value)) continue;
    points.push({ x: plot.bands.center(i), y: plot.valueToY(value) });
  }
  return points;
}

/**
 * Clareia uma cor hex misturando com branco. Substitui transparência, que o
 * jsPDF só faz via GState — desnecessário para o efeito pretendido.
 */
export function tint(hex: string, strength: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(normalized.slice(offset, offset + 2), 16);
    const mixed = Math.round(255 - (255 - value) * strength);
    return mixed.toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}
