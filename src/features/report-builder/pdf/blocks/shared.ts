/** Helpers compartilhados pelos blocos. */
import type { BlockRenderer } from "../driver";
import { drawEyebrow, drawText, lineHeightMm } from "../primitives";
import { CONTENT, FONT_SIZE, SPACING } from "../reportTheme";

/**
 * Altura do título de bloco. Determinística (eyebrow + título + respiro), então
 * é constante — blocos precisam dela **antes** de desenhar, para reservar título
 * e conteúdo juntos e não deixar título órfão no pé da página.
 */
export const BLOCK_HEADING_HEIGHT_MM =
  lineHeightMm(FONT_SIZE.small) + lineHeightMm(FONT_SIZE.blockTitle) + SPACING.titleGap;

/**
 * Título de bloco com um eyebrow acima. Desenha na posição atual do cursor
 * **sem avançá-lo** — quem chama controla a reserva de espaço.
 *
 * Devolve a altura consumida, sempre igual a `BLOCK_HEADING_HEIGHT_MM`.
 */
export function drawBlockHeading(
  ctx: Parameters<BlockRenderer>[0],
  heading: string,
  eyebrow: string,
): number {
  const { doc, cursor } = ctx;
  const eyebrowHeight = drawEyebrow(doc, eyebrow, CONTENT.leftMm, cursor.y);
  drawText(doc, heading, CONTENT.leftMm, cursor.y + eyebrowHeight + 0.5, {
    size: FONT_SIZE.blockTitle,
    style: "bold",
  });
  return BLOCK_HEADING_HEIGHT_MM;
}
