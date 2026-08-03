/**
 * Rosca de composição, com legenda em coluna ao lado.
 *
 * Fatias são polígonos de setor anelar (ver `geometry.ts`) porque o jsPDF não
 * tem primitiva de arco.
 */
import type { jsPDF } from "jspdf";

import { formatBRL } from "@/lib/format";

import { drawFilledRect, drawText, lineHeightMm } from "../primitives";
import { COLORS, FONT_SIZE } from "../reportTheme";
import type { ChartFrame } from "./frame";
import { annularSectorPoints, fillPolygon } from "./geometry";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartOptions {
  frame: ChartFrame;
  slices: readonly DonutSlice[];
  /** Fração do raio externo ocupada pelo furo. */
  innerRatio?: number;
  /** Mostrar valor e percentual ao lado do rótulo. */
  showValues?: boolean;
}

const FULL_TURN = Math.PI * 2;
const LEGEND_SWATCH_MM = 2.2;
const LEGEND_GAP_MM = 1.6;
/** Fatia menor que isso não recebe traço separador visível. */
const MIN_SWEEP_RAD = 0.01;

export function drawDonutChart(doc: jsPDF, options: DonutChartOptions): void {
  const { frame } = options;
  const slices = options.slices.filter((s) => Number.isFinite(s.value) && s.value !== 0);
  if (slices.length === 0) return;

  const total = slices.reduce((acc, s) => acc + Math.abs(s.value), 0);
  if (total === 0) return;

  const diameter = Math.min(frame.heightMm, frame.widthMm * 0.45);
  const outerRadius = diameter / 2;
  const innerRadius = outerRadius * (options.innerRatio ?? 0.6);
  const cx = frame.xMm + outerRadius;
  const cy = frame.yMm + frame.heightMm / 2;

  let angle = 0;
  for (const slice of slices) {
    const sweep = (Math.abs(slice.value) / total) * FULL_TURN;
    if (sweep > MIN_SWEEP_RAD) {
      fillPolygon(
        doc,
        annularSectorPoints(cx, cy, innerRadius, outerRadius, angle, angle + sweep),
        slice.color,
      );
    }
    angle += sweep;
  }

  drawSideLegend(doc, slices, total, {
    xMm: frame.xMm + diameter + 6,
    yMm: frame.yMm,
    widthMm: frame.widthMm - diameter - 6,
    heightMm: frame.heightMm,
    showValues: options.showValues ?? true,
  });
}

interface SideLegendOptions {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  showValues: boolean;
}

/** Legenda em coluna: uma linha por fatia, com valor e percentual à direita. */
function drawSideLegend(
  doc: jsPDF,
  slices: readonly DonutSlice[],
  total: number,
  options: SideLegendOptions,
): void {
  const rowHeight = lineHeightMm(FONT_SIZE.legend) + 1.4;
  const maxRows = Math.max(1, Math.floor(options.heightMm / rowHeight));
  const visible = slices.slice(0, maxRows);
  const right = options.xMm + options.widthMm;

  visible.forEach((slice, i) => {
    const y = options.yMm + i * rowHeight;
    drawFilledRect(
      doc,
      options.xMm,
      y + (lineHeightMm(FONT_SIZE.legend) - LEGEND_SWATCH_MM) / 2,
      LEGEND_SWATCH_MM,
      LEGEND_SWATCH_MM,
      slice.color,
    );

    const valueText = options.showValues
      ? `${formatBRL(slice.value)} · ${percent(slice.value, total)}`
      : "";
    doc.setFontSize(FONT_SIZE.legend);
    const valueWidth = valueText === "" ? 0 : doc.getTextWidth(valueText);

    const labelX = options.xMm + LEGEND_SWATCH_MM + LEGEND_GAP_MM;
    const labelWidth = options.widthMm - LEGEND_SWATCH_MM - LEGEND_GAP_MM - valueWidth - 2;
    drawText(doc, truncate(doc, slice.label, labelWidth), labelX, y, {
      size: FONT_SIZE.legend,
      color: COLORS.text,
    });

    if (valueText !== "") {
      drawText(doc, valueText, right, y, {
        size: FONT_SIZE.legend,
        color: COLORS.textMuted,
        align: "right",
      });
    }
  });
}

function percent(value: number, total: number): string {
  return `${((Math.abs(value) / total) * 100).toFixed(1).replace(".", ",")}%`;
}

/** Corta com elipse quando o rótulo não cabe na largura disponível. */
function truncate(doc: jsPDF, text: string, maxWidthMm: number): string {
  if (maxWidthMm <= 0) return "";
  if (doc.getTextWidth(text) <= maxWidthMm) return text;

  let result = text;
  while (result.length > 1 && doc.getTextWidth(`${result}...`) > maxWidthMm) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}
