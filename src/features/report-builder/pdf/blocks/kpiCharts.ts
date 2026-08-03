/**
 * Blocos de gráfico derivados de `kpi_dashboard`.
 *
 * Ficam juntos porque compartilham o mesmo mapeamento: alinhar a série mensal do
 * ano corrente com a do anterior **pelo índice do mês**, não pela posição no
 * array — um mês sem lançamento simplesmente não vem do banco, e comparar por
 * posição deslocaria o ano inteiro.
 */
import type { MonthlyKpi } from "@/features/kpis/api";

import type { ReportKpis } from "../../data/types";
import { drawBarChart, type ChartSeries } from "../charts/bar";
import { monthCategory } from "../charts/format";
import { drawLineChart } from "../charts/line";
import type { BlockRenderer } from "../driver";
import { CHART_HEIGHT, COLORS, NEUTRAL_SERIES } from "../reportTheme";
import { renderChartBlock } from "./chartBlock";

type MonthlyField = keyof Pick<
  MonthlyKpi,
  "gross_revenue" | "net_revenue" | "net_result" | "cash_generation"
>;

interface AlignedSeries {
  categories: string[];
  /** `null` = o ano não tem esse mês. Diferente de zero, que é receita nula. */
  current: (number | null)[];
  previous: (number | null)[];
}

/**
 * Une as duas séries anuais por mês (1–12), mantendo só os meses em que ao menos
 * um dos anos tem dado.
 *
 * Mês ausente vira `null`, **não zero**: no acumulado, tratar ausente como zero
 * faria a linha seguir horizontal até dezembro, sugerindo receita estagnada em
 * vez de ausência de dado.
 */
function alignByMonth(kpis: ReportKpis, field: MonthlyField): AlignedSeries {
  const monthOf = (row: MonthlyKpi) => Number(row.month_start.slice(5, 7));
  const currentByMonth = new Map(kpis.current.monthly.map((r) => [monthOf(r), r]));
  const previousByMonth = new Map(kpis.previous.monthly.map((r) => [monthOf(r), r]));

  const categories: string[] = [];
  const current: (number | null)[] = [];
  const previous: (number | null)[] = [];

  for (let month = 1; month <= 12; month += 1) {
    const currentRow = currentByMonth.get(month);
    const previousRow = previousByMonth.get(month);
    if (currentRow == null && previousRow == null) continue;

    const reference = currentRow?.month_start ?? previousRow?.month_start;
    categories.push(reference == null ? String(month) : monthCategory(reference));
    current.push(currentRow == null ? null : currentRow[field]);
    previous.push(previousRow == null ? null : previousRow[field]);
  }

  return { categories, current, previous };
}

/**
 * Acumula a série, parando no último mês com dado real.
 *
 * Lacuna no meio conta como zero (mês sem receita registrada realmente não soma),
 * mas depois do último mês conhecido a série termina — a linha para em vez de
 * seguir reta até dezembro.
 */
function accumulate(values: readonly (number | null)[]): (number | null)[] {
  const lastKnown = values.reduce<number>(
    (last, value, index) => (value == null ? last : index),
    -1,
  );
  let running = 0;
  return values.map((value, index) => {
    if (index > lastKnown) return null;
    running += value ?? 0;
    return running;
  });
}

function hasKpiData(kpis: ReportKpis | null): kpis is ReportKpis {
  return kpis != null && (kpis.current.monthly.length > 0 || kpis.previous.monthly.length > 0);
}

/** Receita bruta, receita líquida e resultado por mês do ano de referência. */
export const renderRevenueResultChart: BlockRenderer = (ctx, block) => {
  const kpis = ctx.data.kpis;
  const monthly = kpis?.current.monthly ?? [];

  renderChartBlock(ctx, {
    heading: block.options.heading ?? "Receita e resultado por mês",
    eyebrow: kpis == null ? ctx.period.label : String(kpis.year),
    chartHeightMm: CHART_HEIGHT.full,
    hasData: monthly.length > 0,
    draw: (frame) => {
      const series: ChartSeries[] = [
        {
          label: "Receita bruta",
          color: COLORS.accent,
          values: monthly.map((m) => m.gross_revenue),
        },
        {
          label: "Receita líquida",
          color: COLORS.info,
          values: monthly.map((m) => m.net_revenue),
        },
        {
          label: "Resultado",
          color: COLORS.income,
          values: monthly.map((m) => m.net_result),
        },
      ];
      drawBarChart(ctx.doc, {
        frame,
        categories: monthly.map((m) => monthCategory(m.month_start)),
        series,
        showLegend: true,
      });
    },
  });
};

/** Receita bruta do ano contra o anterior, mês a mês. */
export const renderRevenueYoYChart: BlockRenderer = (ctx, block) => {
  const kpis = ctx.data.kpis;

  renderChartBlock(ctx, {
    heading: block.options.heading ?? "Receita bruta — ano contra ano",
    eyebrow: kpis == null ? ctx.period.label : `${kpis.year} vs ${kpis.year - 1}`,
    chartHeightMm: CHART_HEIGHT.full,
    hasData: hasKpiData(kpis),
    draw: (frame) => {
      if (!hasKpiData(kpis)) return;
      const aligned = alignByMonth(kpis, "gross_revenue");
      drawBarChart(ctx.doc, {
        frame,
        categories: aligned.categories,
        series: [
          { label: String(kpis.year - 1), color: NEUTRAL_SERIES, values: aligned.previous },
          { label: String(kpis.year), color: COLORS.accent, values: aligned.current },
        ],
        showLegend: true,
      });
    },
  });
};

/** Receita acumulada do ano contra o anterior. */
export const renderRevenueAccumulatedYoYChart: BlockRenderer = (ctx, block) => {
  const kpis = ctx.data.kpis;

  renderChartBlock(ctx, {
    heading: block.options.heading ?? "Receita acumulada — ano contra ano",
    eyebrow: kpis == null ? ctx.period.label : `${kpis.year} vs ${kpis.year - 1}`,
    chartHeightMm: CHART_HEIGHT.full,
    hasData: hasKpiData(kpis),
    draw: (frame) => {
      if (!hasKpiData(kpis)) return;
      const aligned = alignByMonth(kpis, "gross_revenue");
      drawLineChart(ctx.doc, {
        frame,
        categories: aligned.categories,
        series: [
          {
            label: `${kpis.year - 1} acumulado`,
            color: NEUTRAL_SERIES,
            values: accumulate(aligned.previous),
          },
          {
            label: `${kpis.year} acumulado`,
            color: COLORS.accent,
            values: accumulate(aligned.current),
          },
        ],
        area: true,
        showLegend: true,
      });
    },
  });
};

/** Resultado líquido mensal do ano contra o anterior. */
export const renderProfitYoYChart: BlockRenderer = (ctx, block) => {
  const kpis = ctx.data.kpis;

  renderChartBlock(ctx, {
    heading: block.options.heading ?? "Resultado líquido — ano contra ano",
    eyebrow: kpis == null ? ctx.period.label : `${kpis.year} vs ${kpis.year - 1}`,
    chartHeightMm: CHART_HEIGHT.full,
    hasData: hasKpiData(kpis),
    draw: (frame) => {
      if (!hasKpiData(kpis)) return;
      const aligned = alignByMonth(kpis, "net_result");
      drawBarChart(ctx.doc, {
        frame,
        categories: aligned.categories,
        series: [
          { label: String(kpis.year - 1), color: NEUTRAL_SERIES, values: aligned.previous },
          { label: String(kpis.year), color: COLORS.income, values: aligned.current },
        ],
        showLegend: true,
      });
    },
  });
};

/** Exportados para teste do alinhamento entre anos. */
export const __testables = { alignByMonth, accumulate };
