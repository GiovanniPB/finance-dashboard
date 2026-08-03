/**
 * Notas e comentários — texto livre para análise qualitativa.
 *
 * É o único bloco cujo conteúdo cresce com a digitação do usuário, então a
 * medição vem antes da reserva: um texto longo precisa saber quantas linhas vai
 * ocupar para decidir se cabe na página.
 */
import type { BlockRenderer } from "../driver";
import { drawParagraph, measureParagraph } from "../primitives";
import { COLORS, CONTENT, FONT_SIZE, SPACING } from "../reportTheme";
import { renderEmptyBlock } from "./chartBlock";
import { BLOCK_HEADING_HEIGHT_MM, drawBlockHeading } from "./shared";

export const renderNotes: BlockRenderer = (ctx, block) => {
  const heading = block.options.heading ?? "Comentários";
  const text = block.options.text?.trim() ?? "";

  if (text === "") {
    renderEmptyBlock(ctx, heading, ctx.period.label, "Sem comentários.");
    return;
  }

  const textHeight = measureParagraph(ctx.doc, text, CONTENT.widthMm, {
    size: FONT_SIZE.body,
  });
  const total = BLOCK_HEADING_HEIGHT_MM + textHeight + SPACING.blockGap;

  const top = ctx.cursor.reserve(total);
  drawBlockHeading(ctx, heading, ctx.period.label);
  ctx.cursor.advance(total);

  drawParagraph(ctx.doc, text, CONTENT.leftMm, top + BLOCK_HEADING_HEIGHT_MM, CONTENT.widthMm, {
    size: FONT_SIZE.body,
    color: COLORS.text,
  });
};
