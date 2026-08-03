/**
 * Esqueleto comum dos blocos de gráfico: título, reserva de espaço, estado vazio
 * e avanço do cursor. O bloco concreto só mapeia dados e desenha dentro da
 * moldura recebida.
 */
import type { ChartFrame } from "../charts/frame";
import type { BlockRenderer } from "../driver";
import { drawText, lineHeightMm } from "../primitives";
import { COLORS, CONTENT, FONT_SIZE, SPACING } from "../reportTheme";
import { BLOCK_HEADING_HEIGHT_MM, drawBlockHeading } from "./shared";

export interface ChartBlockOptions {
  heading: string;
  /** Linha em caixa alta acima do título — normalmente o período. */
  eyebrow: string;
  chartHeightMm: number;
  /** `false` desenha o estado vazio em vez de chamar `draw`. */
  hasData: boolean;
  emptyMessage?: string;
  draw: (frame: ChartFrame) => void;
}

export function renderChartBlock(
  ctx: Parameters<BlockRenderer>[0],
  options: ChartBlockOptions,
): void {
  const { cursor } = ctx;

  if (!options.hasData) {
    renderEmptyBlock(ctx, options.heading, options.eyebrow, options.emptyMessage);
    return;
  }

  // Título e gráfico reservados juntos: se o gráfico não couber, o título vai
  // com ele para a página seguinte em vez de ficar órfão.
  const total = BLOCK_HEADING_HEIGHT_MM + options.chartHeightMm + SPACING.blockGap;
  const top = cursor.reserve(total);
  drawBlockHeading(ctx, options.heading, options.eyebrow);
  cursor.advance(total);

  options.draw({
    xMm: CONTENT.leftMm,
    yMm: top + BLOCK_HEADING_HEIGHT_MM,
    widthMm: CONTENT.widthMm,
    heightMm: options.chartHeightMm,
  });
}

/** Título mais uma linha explicando a ausência de dados. */
export function renderEmptyBlock(
  ctx: Parameters<BlockRenderer>[0],
  heading: string,
  eyebrow: string,
  message = "Sem dados no período.",
): void {
  const { doc, cursor } = ctx;
  const messageHeight = lineHeightMm(FONT_SIZE.body);
  const y = cursor.reserve(BLOCK_HEADING_HEIGHT_MM + messageHeight + SPACING.blockGap);
  drawBlockHeading(ctx, heading, eyebrow);
  cursor.advance(BLOCK_HEADING_HEIGHT_MM + messageHeight + SPACING.blockGap);
  drawText(doc, message, CONTENT.leftMm, y + BLOCK_HEADING_HEIGHT_MM, {
    size: FONT_SIZE.body,
    color: COLORS.textMuted,
  });
}
