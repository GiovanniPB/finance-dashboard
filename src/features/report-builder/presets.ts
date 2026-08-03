/**
 * Composições de fábrica.
 *
 * Mitigam a fadiga de configuração apontada na §9 do plano: abrir a ferramenta
 * numa tela em branco e escolher entre 16 blocos é pior do que partir de algo
 * pronto e ajustar. Cada preset declara escopo compatível para não oferecer
 * composição que o escopo atual não gera.
 */
import type { PeriodPreset, ReportBlockType, ReportComparison, ReportScopeMode } from "./schema";

export interface ReportPreset {
  id: string;
  label: string;
  description: string;
  scopes: readonly ReportScopeMode[];
  period: PeriodPreset;
  comparison: ReportComparison;
  blocks: readonly ReportBlockType[];
}

export const REPORT_PRESETS: readonly ReportPreset[] = [
  {
    id: "mensal-diretoria",
    label: "Mensal · Diretoria",
    description: "Capa, indicadores, receita contra o ano anterior, despesas e DRE.",
    scopes: ["company", "consolidated"],
    period: "last_month",
    comparison: "yoy",
    blocks: [
      "cover",
      "kpi-summary",
      "revenue-result-chart",
      "revenue-yoy-chart",
      "expense-breakdown",
      "dre",
    ],
  },
  {
    id: "trimestral-socios",
    label: "Trimestral · Sócios",
    description: "Visão do trimestre com acumulado, resultado, DRE comparativo e projeção.",
    scopes: ["company"],
    period: "last_quarter",
    comparison: "yoy",
    blocks: [
      "cover",
      "kpi-summary",
      "revenue-accumulated-yoy-chart",
      "profit-yoy-chart",
      "dre-comparison",
      "page-break",
      "cashflow",
      "forecast",
      "notes",
    ],
  },
  {
    id: "fechamento-contabil",
    label: "Fechamento contábil",
    description: "DRE por competência e caixa, saldos bancários, centros de custo e contrapartes.",
    scopes: ["company"],
    period: "last_month",
    comparison: "mom",
    blocks: ["cover", "dre", "page-break", "bank-balances", "cost-centers", "counterparties"],
  },
];

export function presetsForScope(mode: ReportScopeMode): readonly ReportPreset[] {
  return REPORT_PRESETS.filter((preset) => preset.scopes.includes(mode));
}
