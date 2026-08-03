/**
 * Cabeçalho corrido e rodapé.
 *
 * Aplicado **no fim**, num passe sobre todas as páginas: "Página X de Y" exige
 * saber o total, e o total só é conhecido depois que as tabelas paginaram.
 */
import type { jsPDF } from "jspdf";

import type { ResolvedPeriod } from "../period";
import type { ReportConfig } from "../schema";
import { drawRule, drawText } from "./primitives";
import { COLORS, CONTENT, FONT_SIZE, PAGE } from "./reportTheme";

export interface StampPageChromeInput {
  doc: jsPDF;
  config: ReportConfig;
  scopeLabel: string;
  period: ResolvedPeriod;
  /** Páginas sem cabeçalho/rodapé — a capa tem composição própria. */
  skipPages?: ReadonlySet<number>;
}

export function stampPageChrome(input: StampPageChromeInput): void {
  const { doc, config, scopeLabel, period, skipPages } = input;
  const total = doc.getNumberOfPages();
  const right = CONTENT.leftMm + CONTENT.widthMm;
  const footerTop = PAGE.heightMm - PAGE.margin.bottom - PAGE.footerHeightMm;

  for (let page = 1; page <= total; page += 1) {
    if (skipPages?.has(page) === true) continue;
    doc.setPage(page);

    if (config.document.showRunningHeader) {
      drawText(doc, config.document.title, CONTENT.leftMm, PAGE.margin.top, {
        size: FONT_SIZE.header,
        style: "bold",
        color: COLORS.textMuted,
      });
      // Escopo + período no cabeçalho: numa tabela que continua por várias
      // páginas, o título do bloco só aparece na primeira.
      drawText(doc, `${scopeLabel} · ${period.label}`, right, PAGE.margin.top, {
        size: FONT_SIZE.header,
        color: COLORS.textSubtle,
        align: "right",
      });
      drawRule(doc, CONTENT.leftMm, PAGE.margin.top + 5.5, CONTENT.widthMm);
    }

    drawRule(doc, CONTENT.leftMm, footerTop, CONTENT.widthMm);

    const note = config.document.confidentialityNote;
    drawText(
      doc,
      note != null && note !== "" ? note : period.label,
      CONTENT.leftMm,
      footerTop + 2,
      { size: FONT_SIZE.footer, color: COLORS.textSubtle },
    );

    if (config.document.showPageNumbers) {
      drawText(doc, `Página ${page} de ${total}`, right, footerTop + 2, {
        size: FONT_SIZE.footer,
        color: COLORS.textSubtle,
        align: "right",
      });
    }
  }
}
