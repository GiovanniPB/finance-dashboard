/**
 * Busca o snapshot de dados necessário para a composição escolhida.
 *
 * **Por que função assíncrona e não hooks:** a lista de blocos é dinâmica, e
 * hooks do React não podem ser chamados condicionalmente. Orquestrar isso com
 * `useQuery` exigiria montar todos os hooks sempre e desabilitar os não usados.
 * Como a geração é uma ação pontual (clique), buscar direto é mais simples e
 * evita o problema de raiz. As funções chamadas aqui são as mesmas dos hooks,
 * então continuam protegidas por RLS.
 */
import {
  fetchBankBalances,
  fetchCashflowDaily,
  fetchCashflowMonthly,
} from "@/features/cashflow/api";
import { fetchDreByCompany, fetchDreConsolidated } from "@/features/dre/api";
import { computeDreTotals } from "@/features/dre/compute";
import { fetchForecast } from "@/features/forecast/api";
import {
  fetchExpenseBreakdown,
  fetchKpiDashboard,
  fetchKpiDashboardConsolidated,
} from "@/features/kpis/api";
import {
  fetchCostCenterAnalysis,
  fetchCounterpartyAnalysis,
  fetchDreComparison,
  type CounterpartyKindFilter,
} from "@/features/reports/api";

import type { ResolvedPeriod } from "../period";
import type { ReportBlock, ReportBlockType, ReportConfig } from "../schema";
import { emptyReportData, type ReportData } from "./types";

export interface FetchReportDataInput {
  config: ReportConfig;
  period: ResolvedPeriod;
  comparisonPeriod: ResolvedPeriod | null;
  /** Data de emissão em ISO — base do horizonte do forecast. */
  issuedAt: string;
}

/** Blocos que se alimentam de `kpi_dashboard`. */
const KPI_BLOCKS: readonly ReportBlockType[] = [
  "kpi-summary",
  "revenue-result-chart",
  "revenue-yoy-chart",
  "revenue-accumulated-yoy-chart",
  "profit-yoy-chart",
];

const FORECAST_HORIZON_DAYS = 90;

export async function fetchReportData(input: FetchReportDataInput): Promise<ReportData> {
  const { config, period } = input;
  const blocks = config.blocks;
  const types = new Set<ReportBlockType>(blocks.map((b) => b.type));
  const data = emptyReportData();
  const companyId = config.scope.companyId;
  const isConsolidated = config.scope.mode === "consolidated";

  // Tarefas em paralelo: nenhum bloco depende do dado de outro.
  const tasks: Promise<void>[] = [];

  if (types.has("dre")) {
    tasks.push(
      fetchDre(config, period).then((rows) => {
        data.dre = rows;
      }),
    );
  }

  if (KPI_BLOCKS.some((type) => types.has(type))) {
    tasks.push(
      fetchKpis(config, period).then((kpis) => {
        data.kpis = kpis;
      }),
    );
  }

  if (types.has("expense-breakdown")) {
    const limit = optionOf(blocks, "expense-breakdown", (o) => o.topN) ?? 8;
    tasks.push(
      fetchExpenseBreakdown({
        companyId: isConsolidated ? null : companyId,
        organizationId: isConsolidated ? config.scope.organizationId : null,
        companyIds: isConsolidated ? config.scope.companyIds : null,
        from: period.from,
        to: period.to,
        limit,
      }).then((rows) => {
        data.expenses = rows;
      }),
    );
  }

  // Os blocos abaixo só existem por empresa — não há RPC consolidada. Fora do
  // escopo de empresa eles ficam nulos e desenham o estado vazio.
  if (types.has("cashflow") && companyId != null) {
    const granularity = optionOf(blocks, "cashflow", (o) => o.granularity) ?? ("monthly" as const);
    tasks.push(
      fetchCashflow(companyId, period, granularity).then((rows) => {
        data.cashflow = { granularity, rows };
      }),
    );
  }

  if (types.has("cost-centers") && companyId != null) {
    tasks.push(
      fetchCostCenterAnalysis([companyId], period.from, period.to).then((rows) => {
        data.costCenters = rows;
      }),
    );
  }

  if (types.has("forecast") && companyId != null) {
    const to = addDays(input.issuedAt, FORECAST_HORIZON_DAYS);
    tasks.push(
      fetchForecast([companyId], input.issuedAt, to).then((rows) => {
        data.forecast = rows;
      }),
    );
  }

  if (types.has("bank-balances") && companyId != null) {
    tasks.push(
      fetchBankBalances(companyId, period.to).then((rows) => {
        data.bankBalances = rows;
      }),
    );
  }

  if (types.has("counterparties") && companyId != null) {
    const limit = optionOf(blocks, "counterparties", (o) => o.topN) ?? 15;
    const kind: CounterpartyKindFilter =
      optionOf(blocks, "counterparties", (o) => o.counterpartyKind) ?? "all";
    tasks.push(
      fetchCounterpartyAnalysis([companyId], period.from, period.to, kind, limit).then((rows) => {
        data.counterparties = rows;
      }),
    );
  }

  // O comparativo de DRE precisa dos dois períodos; sem eixo de comparação o
  // bloco não é oferecido pela UI, mas a busca também não deve ser tentada.
  if (types.has("dre-comparison") && companyId != null && input.comparisonPeriod != null) {
    const comparison = input.comparisonPeriod;
    tasks.push(
      fetchDreComparison(companyId, period.from, period.to, comparison.from, comparison.to).then(
        (rows) => {
          data.dreComparison = rows;
        },
      ),
    );
  }

  await Promise.all(tasks);
  return data;
}

async function fetchDre(config: ReportConfig, period: ResolvedPeriod) {
  const rows =
    config.scope.mode === "consolidated"
      ? await fetchDreConsolidated(
          config.scope.organizationId,
          period.from,
          period.to,
          config.scope.companyIds,
        )
      : await fetchDreByCompany(config.scope.companyId ?? "", period.from, period.to);
  return computeDreTotals(rows);
}

/**
 * `kpi_dashboard` recebe ano, não intervalo (§5 do plano). Derivamos o ano do
 * **fim** do período e buscamos o anterior em paralelo, para os comparativos.
 */
async function fetchKpis(config: ReportConfig, period: ResolvedPeriod) {
  const year = Number(period.to.slice(0, 4));
  const isConsolidated = config.scope.mode === "consolidated";

  const load = (targetYear: number) =>
    isConsolidated
      ? fetchKpiDashboardConsolidated(
          config.scope.organizationId,
          targetYear,
          config.scope.companyIds,
        )
      : fetchKpiDashboard(config.scope.companyId ?? "", targetYear);

  const [current, previous] = await Promise.all([load(year), load(year - 1)]);
  return { current, previous, year };
}

function fetchCashflow(
  companyId: string,
  period: ResolvedPeriod,
  granularity: "daily" | "monthly",
) {
  if (granularity === "daily") {
    return fetchCashflowDaily([companyId], period.from, period.to);
  }
  return fetchCashflowMonthly([companyId], Number(period.to.slice(0, 4)));
}

/**
 * Primeira opção definida entre as instâncias de um tipo de bloco. Duas
 * instâncias do mesmo bloco com opções divergentes compartilham a busca — a
 * primeira decide, e é o que a UI da Fase 3 vai refletir.
 */
function optionOf<T>(
  blocks: readonly ReportBlock[],
  type: ReportBlockType,
  pick: (options: ReportBlock["options"]) => T | undefined,
): T | undefined {
  for (const block of blocks) {
    if (block.type !== type) continue;
    const value = pick(block.options);
    if (value !== undefined) return value;
  }
  return undefined;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
