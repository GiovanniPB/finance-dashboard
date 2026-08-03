/**
 * Moldura de gráfico: calhas dos eixos, grade e rótulos.
 *
 * Devolve a área de plotagem para as séries desenharem dentro, junto da linha de
 * base do zero — que barras e áreas precisam para não mentir sobre magnitude.
 */
import type { jsPDF } from "jspdf";

import { drawRule, drawText, lineHeightMm } from "../primitives";
import { COLORS, FONT_SIZE } from "../reportTheme";
import { formatCompactBRL } from "./format";
import { bandScale, project, type BandScale, type NiceScale } from "./scale";

export interface ChartFrame {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PlotArea {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** Y da linha de valor zero. */
  baselineYMm: number;
  bands: BandScale;
  scale: NiceScale;
  /** Projeta um valor do domínio no Y do PDF. */
  valueToY(value: number): number;
}

export interface DrawAxesOptions {
  frame: ChartFrame;
  scale: NiceScale;
  categories: readonly string[];
  /** Espaço reservado no topo para a legenda. */
  legendHeightMm?: number;
  formatValue?: (value: number) => string;
}

const GUTTER_GAP_MM = 2;

export function drawAxes(doc: jsPDF, options: DrawAxesOptions): PlotArea {
  const { frame, scale, categories } = options;
  const formatValue = options.formatValue ?? formatCompactBRL;
  const legendHeight = options.legendHeightMm ?? 0;

  const labels = scale.ticks.map(formatValue);
  const leftGutter = widestLabel(doc, labels) + GUTTER_GAP_MM;
  const bottomGutter = lineHeightMm(FONT_SIZE.axis) + GUTTER_GAP_MM;

  const plotX = frame.xMm + leftGutter;
  const plotY = frame.yMm + legendHeight;
  const plotWidth = frame.widthMm - leftGutter;
  const plotHeight = frame.heightMm - legendHeight - bottomGutter;

  const valueToY = (value: number) =>
    project(value, scale.min, scale.max, plotY + plotHeight, plotY);

  // Grade e rótulos do eixo de valores.
  scale.ticks.forEach((tick, i) => {
    const y = valueToY(tick);
    const isZero = tick === 0;
    drawRule(
      doc,
      plotX,
      y,
      plotWidth,
      isZero ? COLORS.borderStrong : COLORS.border,
      isZero ? 0.3 : 0.15,
    );
    drawText(doc, labels[i] ?? "", plotX - GUTTER_GAP_MM, y - lineHeightMm(FONT_SIZE.axis) / 2, {
      size: FONT_SIZE.axis,
      color: COLORS.textSubtle,
      align: "right",
    });
  });

  const bands = bandScale(categories.length, plotX, plotWidth);
  drawCategoryLabels(doc, categories, bands, plotY + plotHeight + GUTTER_GAP_MM);

  return {
    xMm: plotX,
    yMm: plotY,
    widthMm: plotWidth,
    heightMm: plotHeight,
    baselineYMm: valueToY(0),
    bands,
    scale,
    valueToY,
  };
}

/**
 * Rótulos de categoria, pulando de N em N quando não cabem todos — 31 dias de
 * fluxo de caixa não caberiam lado a lado.
 */
function drawCategoryLabels(
  doc: jsPDF,
  categories: readonly string[],
  bands: BandScale,
  yMm: number,
): void {
  if (categories.length === 0) return;

  const widest = widestLabel(doc, categories, FONT_SIZE.axis);
  const stride = Math.max(1, Math.ceil((widest + 1.5) / bands.bandWidth));

  categories.forEach((label, i) => {
    if (i % stride !== 0) return;
    drawText(doc, label, bands.center(i), yMm, {
      size: FONT_SIZE.axis,
      color: COLORS.textSubtle,
      align: "center",
    });
  });
}

function widestLabel(
  doc: jsPDF,
  labels: readonly string[],
  sizePt: number = FONT_SIZE.axis,
): number {
  doc.setFontSize(sizePt);
  return labels.reduce((max, label) => Math.max(max, doc.getTextWidth(label)), 0);
}
