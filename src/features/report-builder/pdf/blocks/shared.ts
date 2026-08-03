/** Helpers compartilhados pelos blocos. */
import type { BlockRenderer } from "../driver";
import { drawEyebrow, drawText, lineHeightMm } from "../primitives";
import { CONTENT, FONT_SIZE, SPACING } from "../reportTheme";

/**
 * Título de bloco com o período como eyebrow acima. Desenha na posição atual do
 * cursor **sem avançá-lo** — quem chama decide se o título e o conteúdo cabem
 * juntos, para não deixar título órfão no pé da página.
 *
 * Devolve a altura consumida em mm.
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
  return eyebrowHeight + lineHeightMm(FONT_SIZE.blockTitle) + SPACING.titleGap;
}
