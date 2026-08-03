/** Helpers compartilhados pelos blocos. */
import { formatBRL } from "@/lib/format";

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

/**
 * Saída (despesa) formatada com sinal negativo.
 *
 * `-Math.abs(0)` é `-0`, que o `Intl.NumberFormat` imprime como "-R$ 0,00" —
 * sem sentido numa coluna de valores. Zero sai sem sinal.
 */
export function formatOutflow(value: number): string {
  if (value === 0 || !Number.isFinite(value)) return formatBRL(0);
  return formatBRL(-Math.abs(value));
}

/** Vermelho de despesa apenas quando há valor: zero não é gasto. */
export function isNegativeValue(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && value < 0;
}
