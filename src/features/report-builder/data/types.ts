/**
 * Snapshot de dados do relatório.
 *
 * Cada campo é `null` quando nenhum bloco escolhido precisa dele — o fetch é
 * guiado pela composição, não pelo catálogo inteiro. Um campo nulo também é o
 * caminho legítimo quando o bloco não existe no escopo consolidado: o bloco
 * desenha seu estado vazio em vez de a geração falhar.
 */
import type { CashflowGranularity, CashflowPeriod } from "@/features/cashflow/types";
import type { DreComputedRow } from "@/features/dre/types";
import type { ForecastDay } from "@/features/forecast/api";
import type { ExpenseBreakdownRow, KpiAggregate } from "@/features/kpis/api";
import type { CostCenterRow } from "@/features/reports/api";

export interface ReportKpis {
  current: KpiAggregate;
  previous: KpiAggregate;
  /** Ano de referência — `kpi_dashboard` é anual, ver §5 do plano. */
  year: number;
}

export interface ReportCashflow {
  granularity: CashflowGranularity;
  rows: CashflowPeriod[];
}

export interface ReportData {
  /** DRE do período principal, já com totais calculados. */
  dre: DreComputedRow[] | null;
  /** Séries mensais do ano corrente e do anterior, para os comparativos. */
  kpis: ReportKpis | null;
  expenses: ExpenseBreakdownRow[] | null;
  cashflow: ReportCashflow | null;
  costCenters: CostCenterRow[] | null;
  forecast: ForecastDay[] | null;
}

export function emptyReportData(): ReportData {
  return {
    dre: null,
    kpis: null,
    expenses: null,
    cashflow: null,
    costCenters: null,
    forecast: null,
  };
}
