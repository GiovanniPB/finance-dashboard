/**
 * Registro de renderers por tipo de bloco.
 *
 * Tipos ausentes aqui são **ignorados e reportados** por `generateReportPdf`
 * (ver `skippedBlocks`), nunca desenhados como espaço vazio silencioso. As fases
 * seguintes do plano preenchem o resto do catálogo.
 */
import type { BlockRendererRegistry } from "../driver";
import { renderCover } from "./cover";
import { renderDre } from "./dre";
import { renderPageBreak } from "./pageBreak";

export const BLOCK_RENDERERS: BlockRendererRegistry = {
  cover: renderCover,
  dre: renderDre,
  "page-break": renderPageBreak,
};
