import { describe, expect, it } from "vitest";

import type { KpiAggregate, MonthlyKpi } from "@/features/kpis/api";

import type { ReportKpis } from "../../data/types";
import { __testables } from "./kpiCharts";

const { alignByMonth, accumulate } = __testables;

function month(monthNumber: number, values: Partial<MonthlyKpi> = {}): MonthlyKpi {
  const pad = String(monthNumber).padStart(2, "0");
  return {
    month_start: `2026-${pad}-01`,
    gross_revenue: values.gross_revenue ?? 0,
    revenue_deductions: 0,
    net_revenue: values.net_revenue ?? 0,
    cogs: 0,
    contribution_margin: 0,
    fixed_costs: 0,
    financial_result: 0,
    net_result: values.net_result ?? 0,
    dividends: 0,
    partner_bonus: 0,
    partner_reimbursement: 0,
    cash_generation: 0,
    gross_margin_pct: 0,
    net_margin_pct: 0,
    effective_tax_rate_pct: 0,
  };
}

function aggregate(monthly: MonthlyKpi[]): KpiAggregate {
  return {
    monthly,
    ytd: {
      gross_revenue: 0,
      net_revenue: 0,
      cogs: 0,
      fixed_costs: 0,
      net_result: 0,
      cash_generation: 0,
      gross_margin_pct: 0,
      net_margin_pct: 0,
      effective_tax_rate_pct: 0,
    },
  };
}

function kpis(currentMonths: MonthlyKpi[], previousMonths: MonthlyKpi[]): ReportKpis {
  return {
    current: aggregate(currentMonths),
    previous: aggregate(previousMonths.map((m) => ({ ...m, month_start: m.month_start }))),
    year: 2026,
  };
}

describe("alignByMonth", () => {
  it("alinha meses correspondentes dos dois anos", () => {
    const result = alignByMonth(
      kpis(
        [month(1, { gross_revenue: 100 }), month(2, { gross_revenue: 200 })],
        [month(1, { gross_revenue: 80 }), month(2, { gross_revenue: 150 })],
      ),
      "gross_revenue",
    );

    expect(result.categories).toHaveLength(2);
    expect(result.current).toEqual([100, 200]);
    expect(result.previous).toEqual([80, 150]);
  });

  it("alinha por mês, não por posição, quando um ano tem lacuna", () => {
    // Ano corrente sem janeiro. Comparar por posição faria fev/2026 cair sobre
    // jan/2025 e deslocaria o ano inteiro.
    const result = alignByMonth(
      kpis(
        [month(2, { gross_revenue: 200 }), month(3, { gross_revenue: 300 })],
        [
          month(1, { gross_revenue: 50 }),
          month(2, { gross_revenue: 150 }),
          month(3, { gross_revenue: 250 }),
        ],
      ),
      "gross_revenue",
    );

    expect(result.categories).toHaveLength(3);
    expect(result.current).toEqual([null, 200, 300]);
    expect(result.previous).toEqual([50, 150, 250]);
  });

  it("descarta meses ausentes nos dois anos", () => {
    const result = alignByMonth(
      kpis([month(6, { gross_revenue: 10 })], [month(6, { gross_revenue: 20 })]),
      "gross_revenue",
    );

    expect(result.categories).toHaveLength(1);
  });

  it("marca como ausente, não zero, o ano que não tem o mês", () => {
    const result = alignByMonth(kpis([month(4, { net_result: 40 })], []), "net_result");

    expect(result.current).toEqual([40]);
    expect(result.previous).toEqual([null]);
  });

  it("lê o campo pedido", () => {
    const source = kpis([month(1, { gross_revenue: 999, net_result: -5 })], []);

    expect(alignByMonth(source, "gross_revenue").current).toEqual([999]);
    expect(alignByMonth(source, "net_result").current).toEqual([-5]);
  });

  it("devolve séries vazias sem nenhum dado", () => {
    const result = alignByMonth(kpis([], []), "gross_revenue");

    expect(result.categories).toEqual([]);
    expect(result.current).toEqual([]);
  });
});

describe("accumulate", () => {
  it("soma progressivamente", () => {
    expect(accumulate([100, 200, 300])).toEqual([100, 300, 600]);
  });

  it("lida com negativos", () => {
    expect(accumulate([100, -50, 25])).toEqual([100, 50, 75]);
  });

  it("para no último mês com dado em vez de seguir reto", () => {
    // O ano corrente só tem 3 meses: a linha precisa terminar em março, não
    // continuar horizontal até dezembro.
    expect(accumulate([100, 200, 300, null, null])).toEqual([100, 300, 600, null, null]);
  });

  it("trata lacuna no meio como zero e mantém a linha", () => {
    expect(accumulate([100, null, 300])).toEqual([100, 100, 400]);
  });

  it("devolve tudo nulo quando não há dado algum", () => {
    expect(accumulate([null, null])).toEqual([null, null]);
  });

  it("devolve vazio para entrada vazia", () => {
    expect(accumulate([])).toEqual([]);
  });
});
