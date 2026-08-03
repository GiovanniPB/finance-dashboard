/**
 * Sumário executivo — grade de cartões com os indicadores acumulados do ano.
 *
 * Os valores vêm do `ytd` de `kpi_dashboard`, que é anual (§5 do plano), então o
 * eyebrow diz o ano explicitamente para o número nunca ficar ambíguo.
 */
import { formatBRL, formatPercent } from "@/lib/format";

import type { BlockRenderer } from "../driver";
import { drawFilledRect, drawText } from "../primitives";
import { COLORS, CONTENT, FONT_SIZE, SPACING } from "../reportTheme";
import { renderEmptyBlock } from "./chartBlock";
import { BLOCK_HEADING_HEIGHT_MM, drawBlockHeading } from "./shared";

const COLUMNS = 3;
const CARD_GAP_MM = 3;
const CARD_HEIGHT_MM = 20;
/** Faixa de cor à esquerda do cartão, como nos KpiCard da tela. */
const ACCENT_BAR_WIDTH_MM = 0.6;

interface KpiCard {
  label: string;
  value: string;
  tone: string;
}

export const renderKpiSummary: BlockRenderer = (ctx, block) => {
  const kpis = ctx.data.kpis;
  const heading = block.options.heading ?? "Sumário executivo";

  if (kpis == null) {
    renderEmptyBlock(ctx, heading, ctx.period.label, "Sem indicadores no período.");
    return;
  }

  const ytd = kpis.current.ytd;
  const cards: KpiCard[] = [
    { label: "Receita bruta", value: formatBRL(ytd.gross_revenue), tone: COLORS.accent },
    { label: "Receita líquida", value: formatBRL(ytd.net_revenue), tone: COLORS.info },
    {
      label: "Resultado líquido",
      value: formatBRL(ytd.net_result),
      tone: ytd.net_result < 0 ? COLORS.expense : COLORS.income,
    },
    {
      label: "Margem bruta",
      value: formatPercent(ytd.gross_margin_pct, { fromHundred: true }),
      tone: COLORS.accent,
    },
    {
      label: "Margem líquida",
      value: formatPercent(ytd.net_margin_pct, { fromHundred: true }),
      tone: ytd.net_margin_pct < 0 ? COLORS.expense : COLORS.income,
    },
    {
      label: "Geração de caixa",
      value: formatBRL(ytd.cash_generation),
      tone: ytd.cash_generation < 0 ? COLORS.warning : COLORS.info,
    },
  ];

  const rows = Math.ceil(cards.length / COLUMNS);
  const gridHeight = rows * CARD_HEIGHT_MM + (rows - 1) * CARD_GAP_MM;
  const total = BLOCK_HEADING_HEIGHT_MM + gridHeight + SPACING.blockGap;

  const top = ctx.cursor.reserve(total);
  drawBlockHeading(ctx, heading, `acumulado de ${kpis.year}`);
  ctx.cursor.advance(total);

  const cardWidth = (CONTENT.widthMm - CARD_GAP_MM * (COLUMNS - 1)) / COLUMNS;

  cards.forEach((card, i) => {
    const column = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const x = CONTENT.leftMm + column * (cardWidth + CARD_GAP_MM);
    const y = top + BLOCK_HEADING_HEIGHT_MM + row * (CARD_HEIGHT_MM + CARD_GAP_MM);

    drawFilledRect(ctx.doc, x, y, cardWidth, CARD_HEIGHT_MM, COLORS.surfaceAlt);
    drawFilledRect(ctx.doc, x, y, ACCENT_BAR_WIDTH_MM, CARD_HEIGHT_MM, card.tone);

    const labelHeight = drawText(ctx.doc, card.label.toUpperCase(), x + 3.5, y + 3.5, {
      size: FONT_SIZE.kpiLabel,
      style: "bold",
      color: COLORS.textSubtle,
      charSpace: 0.25,
    });
    drawText(ctx.doc, card.value, x + 3.5, y + 3.5 + labelHeight + 1.5, {
      size: FONT_SIZE.kpiValue,
      style: "bold",
      color: COLORS.text,
    });
  });
};
