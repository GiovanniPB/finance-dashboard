/**
 * Capa — ocupa a página inteira.
 *
 * Não gerencia página: o orquestrador garante que um bloco `fullPage` comece
 * numa página limpa e que o bloco seguinte comece na próxima.
 */
import { formatDate } from "@/lib/dates";

import { COMPARISON_LABELS } from "../../schema";
import type { BlockRenderer } from "../driver";
import {
  drawEyebrow,
  drawFilledRect,
  drawParagraph,
  drawRule,
  drawText,
  lineHeightMm,
} from "../primitives";
import { COLORS, CONTENT, FONT_SIZE, PAGE } from "../reportTheme";

/** Faixa de marca sangrando na borda superior. */
const BRAND_BAR_HEIGHT_MM = 3;
/** Título começa abaixo do meio-superior, para dar respiro editorial. */
const TITLE_TOP_MM = 96;
const META_TOP_MM = 196;
const META_ROW_GAP_MM = 11;

export const renderCover: BlockRenderer = (ctx) => {
  const { doc, config } = ctx;
  const left = CONTENT.leftMm;
  const width = CONTENT.widthMm;

  drawFilledRect(doc, 0, 0, PAGE.widthMm, BRAND_BAR_HEIGHT_MM, COLORS.accent);

  drawEyebrow(doc, "Relatório gerencial", left, 28);
  drawText(doc, "OTM Group", left, 28 + lineHeightMm(FONT_SIZE.small) + 1, {
    size: FONT_SIZE.coverMeta,
    color: COLORS.textMuted,
  });

  let y = TITLE_TOP_MM;
  y += drawParagraph(doc, config.document.title, left, y, width, {
    size: FONT_SIZE.coverTitle,
    style: "bold",
  });

  if (config.document.subtitle != null && config.document.subtitle !== "") {
    y += 3;
    y += drawParagraph(doc, config.document.subtitle, left, y, width, {
      size: FONT_SIZE.coverSubtitle,
      color: COLORS.textMuted,
    });
  }

  y += 6;
  drawRule(doc, left, y, 32, COLORS.accent, 0.8);

  drawMetaGrid(ctx, left, width);

  if (config.document.confidentialityNote != null && config.document.confidentialityNote !== "") {
    drawParagraph(
      doc,
      config.document.confidentialityNote,
      left,
      PAGE.heightMm - PAGE.margin.bottom - 8,
      width,
      { size: FONT_SIZE.footer, color: COLORS.textSubtle },
    );
  }
};

/** Grade de metadados em duas colunas: rótulo em caixa alta sobre o valor. */
function drawMetaGrid(ctx: Parameters<BlockRenderer>[0], leftMm: number, widthMm: number): void {
  const { doc, period, comparisonPeriod, scopeLabel, config, issuedAt } = ctx;

  const entries: { label: string; value: string }[] = [
    { label: "Empresa", value: scopeLabel },
    { label: "Período", value: period.label },
    {
      label: "Comparativo",
      value:
        comparisonPeriod == null
          ? COMPARISON_LABELS.none
          : `${COMPARISON_LABELS[config.comparison]} · ${comparisonPeriod.label}`,
    },
    { label: "Emitido em", value: formatDate(issuedAt) },
  ];

  const columnWidth = widthMm / 2;

  entries.forEach((entry, i) => {
    const column = i % 2;
    const row = Math.floor(i / 2);
    const x = leftMm + column * columnWidth;
    const y = META_TOP_MM + row * (META_ROW_GAP_MM + 5);

    const labelHeight = drawText(doc, entry.label.toUpperCase(), x, y, {
      size: FONT_SIZE.footer,
      style: "bold",
      color: COLORS.textSubtle,
      charSpace: 0.3,
    });
    drawParagraph(doc, entry.value, x, y + labelHeight + 0.5, columnWidth - 6, {
      size: FONT_SIZE.coverMeta,
      color: COLORS.text,
    });
  });
}
