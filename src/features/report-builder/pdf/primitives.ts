/**
 * Primitivas de desenho — a camada fina que evita repetir setFont/setColor e a
 * conversão pt↔mm em cada bloco.
 *
 * Todo posicionamento vertical usa `baseline: "top"`: o Y informado é o topo do
 * texto, não a linha de base. Sem isso a aritmética do cursor não fecha.
 */
import type { jsPDF } from "jspdf";

import { COLORS, FONT_FAMILY, FONT_SIZE, LINE_HEIGHT } from "./reportTheme";

/** 1pt = 1/72in; 1in = 25.4mm. */
const MM_PER_PT = 25.4 / 72;

export function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}

/** Altura de uma linha de texto no tamanho informado, em mm. */
export function lineHeightMm(sizePt: number): number {
  return ptToMm(sizePt) * LINE_HEIGHT;
}

export type FontStyle = "normal" | "bold" | "italic";

export interface TextStyle {
  size?: number;
  style?: FontStyle;
  color?: string;
}

export function applyTextStyle(doc: jsPDF, style: TextStyle = {}): void {
  doc.setFont(FONT_FAMILY, style.style ?? "normal");
  doc.setFontSize(style.size ?? FONT_SIZE.body);
  doc.setTextColor(style.color ?? COLORS.text);
}

export interface DrawTextOptions extends TextStyle {
  align?: "left" | "center" | "right";
  /** Espaçamento entre caracteres, em pt — usado nos rótulos em caixa alta. */
  charSpace?: number;
}

/** Desenha uma linha única e devolve a altura consumida em mm. */
export function drawText(
  doc: jsPDF,
  text: string,
  xMm: number,
  yMm: number,
  options: DrawTextOptions = {},
): number {
  applyTextStyle(doc, options);
  doc.text(text, xMm, yMm, {
    baseline: "top",
    align: options.align ?? "left",
    charSpace: options.charSpace,
  });
  return lineHeightMm(options.size ?? FONT_SIZE.body);
}

/**
 * Desenha texto com quebra automática em `maxWidthMm` e devolve a altura total
 * consumida em mm.
 */
/**
 * `splitTextToSize` é tipado como `any` no jsPDF. Estreitamos aqui, num único
 * lugar, em vez de espalhar casts pelos blocos.
 */
function splitLines(doc: jsPDF, text: string, maxWidthMm: number): string[] {
  const result: unknown = doc.splitTextToSize(text, maxWidthMm);
  if (Array.isArray(result)) return result.map(String);
  return [String(result)];
}

export function drawParagraph(
  doc: jsPDF,
  text: string,
  xMm: number,
  yMm: number,
  maxWidthMm: number,
  options: DrawTextOptions = {},
): number {
  applyTextStyle(doc, options);
  const lines = splitLines(doc, text, maxWidthMm);
  const step = lineHeightMm(options.size ?? FONT_SIZE.body);
  lines.forEach((line, i) => {
    doc.text(line, xMm, yMm + i * step, {
      baseline: "top",
      align: options.align ?? "left",
    });
  });
  return lines.length * step;
}

/** Altura que `drawParagraph` consumiria, sem desenhar. */
export function measureParagraph(
  doc: jsPDF,
  text: string,
  maxWidthMm: number,
  options: TextStyle = {},
): number {
  applyTextStyle(doc, options);
  const lines = splitLines(doc, text, maxWidthMm);
  return lines.length * lineHeightMm(options.size ?? FONT_SIZE.body);
}

export function drawRule(
  doc: jsPDF,
  xMm: number,
  yMm: number,
  widthMm: number,
  color: string = COLORS.border,
  thicknessMm = 0.2,
): void {
  doc.setDrawColor(color);
  doc.setLineWidth(thicknessMm);
  doc.line(xMm, yMm, xMm + widthMm, yMm);
}

export function drawFilledRect(
  doc: jsPDF,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  color: string,
): void {
  doc.setFillColor(color);
  doc.rect(xMm, yMm, widthMm, heightMm, "F");
}

/**
 * Rótulo de seção em caixa alta — usado como "eyebrow" acima de títulos.
 * Devolve a altura consumida em mm.
 */
export function drawEyebrow(doc: jsPDF, text: string, xMm: number, yMm: number): number {
  return drawText(doc, text.toUpperCase(), xMm, yMm, {
    size: FONT_SIZE.small,
    style: "bold",
    color: COLORS.textSubtle,
    charSpace: 0.4,
  });
}
