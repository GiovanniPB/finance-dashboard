/**
 * Integração dos renderers de bloco: cada bloco desenha com dados e sem dados,
 * e a composição completa gera um PDF de várias páginas.
 *
 * Não compara pixels — garante que nenhum bloco estoura com dado ausente, zerado
 * ou negativo, que é o modo real de falhar de um gerador de PDF.
 */
import { describe, expect, it } from "vitest";

import type { BankAccountBalance, CashflowPeriod } from "@/features/cashflow/types";
import type { DreComputedRow } from "@/features/dre/types";
import type { ForecastDay } from "@/features/forecast/api";
import type { ExpenseBreakdownRow, KpiAggregate, MonthlyKpi } from "@/features/kpis/api";
import type { CostCenterRow, CounterpartyRow, DreComparisonRow } from "@/features/reports/api";

import { createBlock } from "../../blocks/catalog";
import { emptyReportData, type ReportData, type ReportKpis } from "../../data/types";
import type { ResolvedPeriod } from "../../period";
import {
  emptyReportConfig,
  type ReportBlock,
  type ReportBlockType,
  type ReportScopeMode,
} from "../../schema";
import { generateReportPdf } from "../jsPdfDriver";

const ORG = "00000000-0000-0000-0000-000000000001";
const COMPANY = "11111111-1111-1111-1111-111111111111";
const PERIOD: ResolvedPeriod = { from: "2026-01-01", to: "2026-07-31", label: "2026 (YTD)" };

/* ─── Fixtures ────────────────────────────────────────────────────────── */

function monthlyKpi(monthNumber: number, gross: number, net: number): MonthlyKpi {
  return {
    month_start: `2026-${String(monthNumber).padStart(2, "0")}-01`,
    gross_revenue: gross,
    revenue_deductions: gross * 0.07,
    net_revenue: gross * 0.93,
    cogs: gross * 0.3,
    contribution_margin: gross * 0.63,
    fixed_costs: gross * 0.25,
    financial_result: -1_200,
    net_result: net,
    dividends: 0,
    partner_bonus: 0,
    partner_reimbursement: 0,
    cash_generation: net * 0.9,
    gross_margin_pct: 63,
    net_margin_pct: 20,
    effective_tax_rate_pct: 7,
  };
}

function aggregate(monthly: MonthlyKpi[]): KpiAggregate {
  return {
    monthly,
    ytd: {
      gross_revenue: monthly.reduce((a, m) => a + m.gross_revenue, 0),
      net_revenue: 0,
      cogs: 0,
      fixed_costs: 0,
      net_result: monthly.reduce((a, m) => a + m.net_result, 0),
      cash_generation: 0,
      gross_margin_pct: 63,
      net_margin_pct: 20,
      effective_tax_rate_pct: 7,
    },
  };
}

function kpiFixture(): ReportKpis {
  return {
    current: aggregate([
      monthlyKpi(1, 980_000, 210_000),
      monthlyKpi(2, 1_120_000, 240_000),
      monthlyKpi(3, 1_284_500, -45_000),
      monthlyKpi(4, 1_040_000, 180_000),
    ]),
    previous: aggregate([
      monthlyKpi(1, 820_000, 150_000),
      monthlyKpi(2, 910_000, 170_000),
      monthlyKpi(3, 1_010_000, 190_000),
    ]),
    year: 2026,
  };
}

function dreFixture(count = 12): DreComputedRow[] {
  return Array.from({ length: count }, (_, i) => ({
    account_id: `a${i}`,
    parent_id: null,
    code: `3.${String(i).padStart(2, "0")}`,
    name: `Conta ${i}`,
    kind: "operating_expense" as const,
    dre_section: null,
    is_summary: i % 4 === 0,
    below_the_line: false,
    sign_hint: null,
    sort_order: i,
    total: 0,
    total_cash: 0,
    effective_total: i % 3 === 0 ? -12_500 * (i + 1) : 8_400 * (i + 1),
    effective_total_cash: i % 3 === 0 ? -11_000 * (i + 1) : 7_900 * (i + 1),
    depth: i % 4 === 0 ? 0 : 1,
  }));
}

function expensesFixture(): ExpenseBreakdownRow[] {
  return [
    {
      account_id: "1",
      account_code: "4.01",
      account_name: "Folha administrativa",
      total: 198_450,
      is_other: false,
    },
    {
      account_id: "2",
      account_code: "4.02",
      account_name: "Pró-labore dos sócios",
      total: 84_000,
      is_other: false,
    },
    {
      account_id: "3",
      account_code: "4.03",
      account_name: "Aluguel e condomínio",
      total: 42_360,
      is_other: false,
    },
    { account_id: null, account_code: null, account_name: "Outros", total: 31_800, is_other: true },
  ];
}

function cashflowFixture(): CashflowPeriod[] {
  return Array.from({ length: 7 }, (_, i) => ({
    bucket: `2026-${String(i + 1).padStart(2, "0")}-01`,
    inflow: 300_000 + i * 12_000,
    outflow: 250_000 + i * 18_000,
    net: 50_000 - i * 6_000,
  }));
}

function costCentersFixture(): CostCenterRow[] {
  return Array.from({ length: 5 }, (_, i) => ({
    costCenterId: `cc${i}`,
    companiesCount: 1,
    name: `Centro ${i}`,
    revenue: 200_000 - i * 20_000,
    expense: 120_000 + i * 15_000,
    net: 80_000 - i * 35_000,
    marginPct: 40 - i * 12,
    transactionCount: 30 + i,
  }));
}

function forecastFixture(): ForecastDay[] {
  return Array.from({ length: 90 }, (_, i) => ({
    day: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
    inflowExpected: 12_000,
    outflowExpected: 9_000,
    inflowRecurring: 2_000,
    outflowRecurring: 1_500,
    runningBalance: 150_000 + i * 3_500 - (i > 60 ? (i - 60) * 12_000 : 0),
  }));
}

function dreComparisonFixture(): DreComparisonRow[] {
  return Array.from({ length: 10 }, (_, i) => ({
    accountId: `a${i}`,
    code: i % 3 === 0 ? `${i}` : `${i}.01`,
    name: `Conta comparada ${i}`,
    dreSection: null,
    isSummary: i % 3 === 0,
    sortOrder: i,
    totalA: 120_000 - i * 8_000,
    totalB: 100_000 - i * 6_000,
    varianceAbs: 20_000 - i * 2_000,
    // Base zero não tem taxa definida — o bloco precisa mostrar "—".
    variancePct: i === 4 ? null : 12.5 - i,
  }));
}

function bankBalancesFixture(): BankAccountBalance[] {
  return [
    {
      bank_account_id: "b1",
      bank_name: "Itaú",
      nickname: "Conta movimento",
      account_type: "checking",
      initial_balance: 120_000,
      inflow: 480_000,
      outflow: 410_000,
      closing_balance: 190_000,
    },
    {
      bank_account_id: "b2",
      bank_name: "Nubank",
      nickname: "Nubank",
      account_type: "checking",
      initial_balance: 30_000,
      inflow: 90_000,
      outflow: 145_000,
      closing_balance: -25_000,
    },
  ];
}

function counterpartiesFixture(): CounterpartyRow[] {
  return Array.from({ length: 8 }, (_, i) => ({
    counterpartyId: `cp${i}`,
    companiesCount: 1,
    name: `Contraparte ${i}`,
    kind: i % 2 === 0 ? "customer" : "supplier",
    totalInflow: i % 2 === 0 ? 180_000 - i * 12_000 : 0,
    totalOutflow: i % 2 === 0 ? 0 : 90_000 - i * 5_000,
    net: i % 2 === 0 ? 180_000 - i * 12_000 : -(90_000 - i * 5_000),
    transactionCount: 12 + i,
    avgTicket: 5_000,
    lastMovement: "2026-07-20",
  }));
}

function fullData(): ReportData {
  return {
    dre: dreFixture(),
    kpis: kpiFixture(),
    expenses: expensesFixture(),
    cashflow: { granularity: "monthly", rows: cashflowFixture() },
    costCenters: costCentersFixture(),
    forecast: forecastFixture(),
    dreComparison: dreComparisonFixture(),
    bankBalances: bankBalancesFixture(),
    counterparties: counterpartiesFixture(),
  };
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function render(
  blocks: ReportBlock[],
  data: Partial<ReportData>,
  mode: ReportScopeMode = "company",
) {
  const base = emptyReportConfig({
    organizationId: ORG,
    companyId: mode === "company" ? COMPANY : null,
    mode,
  });
  return generateReportPdf({
    config: { ...base, blocks },
    data: { ...emptyReportData(), ...data },
    period: PERIOD,
    comparisonPeriod: { from: "2025-01-01", to: "2025-07-31", label: "2025 (YTD)" },
    scopeLabel: mode === "company" ? "RCO Tecnologia" : "Consolidado · OTM Group",
    issuedAt: "2026-08-03",
  });
}

/** Todo o catálogo tem renderer — a lista precisa acompanhar `BLOCK_TYPES`. */
const IMPLEMENTED: ReportBlockType[] = [
  "cover",
  "page-break",
  "notes",
  "kpi-summary",
  "dre",
  "dre-comparison",
  "revenue-result-chart",
  "revenue-yoy-chart",
  "revenue-accumulated-yoy-chart",
  "profit-yoy-chart",
  "expense-breakdown",
  "cashflow",
  "bank-balances",
  "cost-centers",
  "counterparties",
  "forecast",
];

/** Blocos com estado vazio próprio quando o dado não vem. */
const CHART_BLOCKS: ReportBlockType[] = [
  "kpi-summary",
  "dre-comparison",
  "bank-balances",
  "counterparties",
  "revenue-result-chart",
  "revenue-yoy-chart",
  "revenue-accumulated-yoy-chart",
  "profit-yoy-chart",
  "expense-breakdown",
  "cashflow",
  "cost-centers",
  "forecast",
];

/* ─── Testes ──────────────────────────────────────────────────────────── */

describe("renderers de bloco", () => {
  it.each(IMPLEMENTED)("desenha %s com dados", async (type) => {
    const report = await render([createBlock(type, `${type}-1`)], fullData());

    expect(report.blob.size).toBeGreaterThan(0);
    expect(report.skippedBlocks).toEqual([]);
  });

  it.each(CHART_BLOCKS)("desenha o estado vazio de %s sem dados", async (type) => {
    const report = await render([createBlock(type, `${type}-1`)], {});

    expect(report.blob.size).toBeGreaterThan(0);
    expect(report.pageCount).toBe(1);
  });

  it.each(CHART_BLOCKS)("desenha %s com séries todas em zero", async (type) => {
    const zeroed: Partial<ReportData> = {
      kpis: {
        current: aggregate([monthlyKpi(1, 0, 0), monthlyKpi(2, 0, 0)]),
        previous: aggregate([monthlyKpi(1, 0, 0)]),
        year: 2026,
      },
      expenses: [
        { account_id: "1", account_code: "x", account_name: "Zerada", total: 0, is_other: false },
      ],
      cashflow: {
        granularity: "monthly",
        rows: [{ bucket: "2026-01-01", inflow: 0, outflow: 0, net: 0 }],
      },
      costCenters: [
        {
          costCenterId: "c",
          companiesCount: 1,
          name: "Zerado",
          revenue: 0,
          expense: 0,
          net: 0,
          marginPct: null,
          transactionCount: 0,
        },
      ],
      forecast: [
        {
          day: "2026-08-01",
          inflowExpected: 0,
          outflowExpected: 0,
          inflowRecurring: 0,
          outflowRecurring: 0,
          runningBalance: 0,
        },
      ],
      dreComparison: [
        {
          accountId: "a",
          code: "1",
          name: "Zerada",
          dreSection: null,
          isSummary: false,
          sortOrder: 0,
          totalA: 0,
          totalB: 0,
          varianceAbs: 0,
          variancePct: null,
        },
      ],
      bankBalances: [
        {
          bank_account_id: "b",
          bank_name: "Banco",
          nickname: "Banco",
          account_type: "checking",
          initial_balance: 0,
          inflow: 0,
          outflow: 0,
          closing_balance: 0,
        },
      ],
      counterparties: [
        {
          counterpartyId: "c",
          companiesCount: 1,
          name: "Zerada",
          kind: "customer",
          totalInflow: 0,
          totalOutflow: 0,
          net: 0,
          transactionCount: 0,
          avgTicket: 0,
          lastMovement: "2026-07-01",
        },
      ],
    };

    const report = await render([createBlock(type, `${type}-1`)], zeroed);

    expect(report.blob.size).toBeGreaterThan(0);
  });
});

describe("composição completa", () => {
  it("gera relatório de várias páginas com todos os blocos da fase", async () => {
    const blocks = IMPLEMENTED.map((type) => createBlock(type, `${type}-1`));
    const report = await render(blocks, fullData());

    expect(report.pageCount).toBeGreaterThan(2);
    expect(report.skippedBlocks).toEqual([]);
  });

  it("mantém a tabela de apoio quando pedida", async () => {
    const withTables: ReportBlock[] = [
      { instanceId: "e1", type: "expense-breakdown", options: { showTable: true } },
      { instanceId: "c1", type: "cashflow", options: { showTable: true, granularity: "monthly" } },
    ];
    const report = await render(withTables, fullData());

    expect(report.blob.size).toBeGreaterThan(0);
  });

  it("desenha centros de custo sem gráfico quando showChart é falso", async () => {
    const report = await render(
      [{ instanceId: "cc1", type: "cost-centers", options: { showChart: false } }],
      fullData(),
    );

    expect(report.blob.size).toBeGreaterThan(0);
  });

  it("explica a ausência de dados por empresa no escopo consolidado", async () => {
    // No consolidado esses blocos não têm RPC — o snapshot vem nulo e o bloco
    // precisa desenhar a explicação em vez de estourar.
    const blocks = (["cashflow", "cost-centers", "forecast"] as const).map((type) =>
      createBlock(type, `${type}-1`),
    );
    const report = await render(blocks, { kpis: kpiFixture() }, "consolidated");

    expect(report.blob.size).toBeGreaterThan(0);
    expect(report.skippedBlocks).toEqual([]);
  });
});
