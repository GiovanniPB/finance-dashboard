/**
 * Contrato de renderização de blocos.
 *
 * Fronteira entre "o que entra no relatório" (config + dados) e "como sai"
 * (driver). Um bloco recebe o contexto, desenha e deixa o cursor na posição
 * seguinte. Nenhum bloco conhece a composição inteira nem decide paginação
 * global — isso é do cursor e do orquestrador.
 */
import type { jsPDF } from "jspdf";

import type { ReportData } from "../data/types";
import type { LayoutCursor } from "../layout/cursor";
import type { ResolvedPeriod } from "../period";
import type { ReportBlock, ReportBlockType, ReportConfig } from "../schema";

export interface ReportRenderContext {
  doc: jsPDF;
  cursor: LayoutCursor;
  config: ReportConfig;
  period: ResolvedPeriod;
  comparisonPeriod: ResolvedPeriod | null;
  /** Nome fantasia da empresa, ou rótulo do consolidado. */
  scopeLabel: string;
  /** Data de emissão em ISO (`YYYY-MM-DD`), injetada para o PDF ser determinístico. */
  issuedAt: string;
  data: ReportData;
}

export type BlockRenderer = (ctx: ReportRenderContext, block: ReportBlock) => void;

/**
 * Blocos sem renderer são **ignorados e reportados** por `generateReportPdf`,
 * em vez de falhar ou desenhar um espaço vazio silencioso.
 */
export type BlockRendererRegistry = Partial<Record<ReportBlockType, BlockRenderer>>;

/** Tipagem estreita do que o plugin autoTable acrescenta ao documento. */
export interface AutoTableDocument {
  lastAutoTable?: { finalY?: number };
}

/** Y final da última tabela desenhada, ou `fallback` se o plugin não informou. */
export function lastTableY(doc: jsPDF, fallback: number): number {
  const finalY = (doc as jsPDF & AutoTableDocument).lastAutoTable?.finalY;
  return typeof finalY === "number" ? finalY : fallback;
}
