/**
 * Registro de renderers por tipo de bloco — agora completo.
 *
 * Se um tipo novo entrar no catálogo sem renderer aqui, `generateReportPdf` o
 * **reporta** em `skippedBlocks` em vez de desenhar espaço vazio silencioso.
 */
import type { BlockRendererRegistry } from "../driver";
import { renderBankBalances } from "./bankBalances";
import { renderCashflow } from "./cashflow";
import { renderCostCenters } from "./costCenters";
import { renderCounterparties } from "./counterparties";
import { renderCover } from "./cover";
import { renderDre } from "./dre";
import { renderDreComparison } from "./dreComparison";
import { renderExpenseBreakdown } from "./expenseBreakdown";
import { renderForecast } from "./forecast";
import {
  renderProfitYoYChart,
  renderRevenueAccumulatedYoYChart,
  renderRevenueResultChart,
  renderRevenueYoYChart,
} from "./kpiCharts";
import { renderKpiSummary } from "./kpiSummary";
import { renderNotes } from "./notes";
import { renderPageBreak } from "./pageBreak";

export const BLOCK_RENDERERS: BlockRendererRegistry = {
  cover: renderCover,
  "page-break": renderPageBreak,
  notes: renderNotes,
  "kpi-summary": renderKpiSummary,
  "revenue-result-chart": renderRevenueResultChart,
  "revenue-yoy-chart": renderRevenueYoYChart,
  "revenue-accumulated-yoy-chart": renderRevenueAccumulatedYoYChart,
  "profit-yoy-chart": renderProfitYoYChart,
  "expense-breakdown": renderExpenseBreakdown,
  dre: renderDre,
  "dre-comparison": renderDreComparison,
  cashflow: renderCashflow,
  "bank-balances": renderBankBalances,
  "cost-centers": renderCostCenters,
  counterparties: renderCounterparties,
  forecast: renderForecast,
};
