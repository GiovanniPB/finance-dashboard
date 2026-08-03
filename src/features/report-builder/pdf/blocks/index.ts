/**
 * Registro de renderers por tipo de bloco.
 *
 * Tipos ausentes aqui são **ignorados e reportados** por `generateReportPdf`
 * (ver `skippedBlocks`), nunca desenhados como espaço vazio silencioso.
 *
 * Faltam da Fase 3: `kpi-summary`, `dre-comparison`, `bank-balances`,
 * `counterparties` e `notes`.
 */
import type { BlockRendererRegistry } from "../driver";
import { renderCashflow } from "./cashflow";
import { renderCostCenters } from "./costCenters";
import { renderCover } from "./cover";
import { renderDre } from "./dre";
import { renderExpenseBreakdown } from "./expenseBreakdown";
import { renderForecast } from "./forecast";
import {
  renderProfitYoYChart,
  renderRevenueAccumulatedYoYChart,
  renderRevenueResultChart,
  renderRevenueYoYChart,
} from "./kpiCharts";
import { renderPageBreak } from "./pageBreak";

export const BLOCK_RENDERERS: BlockRendererRegistry = {
  cover: renderCover,
  "page-break": renderPageBreak,
  dre: renderDre,
  "revenue-result-chart": renderRevenueResultChart,
  "revenue-yoy-chart": renderRevenueYoYChart,
  "revenue-accumulated-yoy-chart": renderRevenueAccumulatedYoYChart,
  "profit-yoy-chart": renderProfitYoYChart,
  "expense-breakdown": renderExpenseBreakdown,
  cashflow: renderCashflow,
  "cost-centers": renderCostCenters,
  forecast: renderForecast,
};
