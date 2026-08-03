/**
 * Legenda desenhada por nós.
 *
 * Não é escolha estética: a `Legend` do Recharts é HTML, não SVG, então nunca
 * viria junto de um gráfico serializado. Como o PDF desenha tudo, controlamos o
 * posicionamento — e ganhamos consistência entre os tipos de gráfico.
 */
import type { jsPDF } from "jspdf";

import { drawFilledRect, drawText, lineHeightMm } from "../primitives";
import { COLORS, FONT_SIZE } from "../reportTheme";

export interface LegendItem {
  label: string;
  color: string;
}

const SWATCH_MM = 2.4;
const SWATCH_GAP_MM = 1.4;
const ITEM_GAP_MM = 5;

/** Altura que a legenda ocupa, para reservar espaço antes de desenhar. */
export function legendHeightMm(): number {
  return lineHeightMm(FONT_SIZE.legend) + 2;
}

/** Desenha os itens numa linha a partir de `xMm`. Devolve a altura consumida. */
export function drawLegend(
  doc: jsPDF,
  items: readonly LegendItem[],
  xMm: number,
  yMm: number,
): number {
  if (items.length === 0) return 0;

  const textHeight = lineHeightMm(FONT_SIZE.legend);
  let cursorX = xMm;

  doc.setFontSize(FONT_SIZE.legend);
  for (const item of items) {
    drawFilledRect(
      doc,
      cursorX,
      yMm + (textHeight - SWATCH_MM) / 2,
      SWATCH_MM,
      SWATCH_MM,
      item.color,
    );
    const labelX = cursorX + SWATCH_MM + SWATCH_GAP_MM;
    drawText(doc, item.label, labelX, yMm, {
      size: FONT_SIZE.legend,
      color: COLORS.textMuted,
    });
    doc.setFontSize(FONT_SIZE.legend);
    cursorX = labelX + doc.getTextWidth(item.label) + ITEM_GAP_MM;
  }

  return legendHeightMm();
}
