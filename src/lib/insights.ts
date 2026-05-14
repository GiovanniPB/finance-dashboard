import { formatBRL } from "./format";

const MONTH_LABELS_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function monthLabel(isoDate: string): string {
  const m = Number(isoDate.slice(5, 7));
  return MONTH_LABELS_PT[m - 1] ?? isoDate;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatPct(value: number, opts: { withSign?: boolean } = {}): string {
  const sign = opts.withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export interface YoYInsight {
  message: string;
  direction: "up" | "down" | null;
}

interface YoYSeries {
  /** Array of { month_start: 'yyyy-mm-dd', value: number }, sorted by date ascending. */
  current: { month_start: string; value: number }[];
  previous: { month_start: string; value: number }[];
}

/**
 * Generates an insight about a YoY series: YTD totals, YoY variation, peak month.
 * Works for any metric (revenue, profit, etc).
 */
export function buildYoYInsight(series: YoYSeries, metricLabel: string): YoYInsight {
  const ytdCurrent = series.current.reduce((s, m) => s + m.value, 0);
  const ytdPrevious = series.previous.reduce((s, m) => s + m.value, 0);
  const delta = pctChange(ytdCurrent, ytdPrevious);

  const peak = series.current.reduce<{ month: string; value: number } | null>((acc, m) => {
    if (!acc || m.value > acc.value) return { month: m.month_start, value: m.value };
    return acc;
  }, null);

  const parts: string[] = [];
  parts.push(`${metricLabel} YTD: ${formatBRL(ytdCurrent)}`);

  if (delta !== null && ytdPrevious !== 0) {
    parts.push(
      `${formatPct(delta, { withSign: true })} vs período anterior (${formatBRL(ytdPrevious)})`,
    );
  }

  if (peak && series.current.length > 1) {
    parts.push(`maior mês: ${monthLabel(peak.month)} com ${formatBRL(peak.value)}`);
  }

  return {
    message: parts.join(" · "),
    direction: delta === null ? null : delta >= 0 ? "up" : "down",
  };
}

interface MarginSeries {
  /** Array of { month_start, gross_margin_pct, net_margin_pct }. */
  current: { month_start: string; gross_margin_pct: number; net_margin_pct: number }[];
  ytdGross: number;
  ytdNet: number;
  /** Optional previous YTD values to compute pp change. */
  previousYtdGross?: number | null;
  previousYtdNet?: number | null;
}

export function buildMarginInsight(series: MarginSeries): YoYInsight {
  const parts: string[] = [];
  parts.push(
    `Margem bruta YTD: ${formatPct(series.ytdGross)} · margem líquida: ${formatPct(series.ytdNet)}`,
  );

  if (series.previousYtdGross != null && series.previousYtdNet != null) {
    const grossPp = series.ytdGross - series.previousYtdGross;
    const netPp = series.ytdNet - series.previousYtdNet;
    parts.push(
      `variação vs período anterior: ${formatPct(grossPp, { withSign: true })} bruta, ${formatPct(netPp, { withSign: true })} líquida`,
    );
  }

  if (series.current.length > 1) {
    const peak = series.current.reduce((a, b) => (a.net_margin_pct > b.net_margin_pct ? a : b));
    parts.push(
      `pico de margem líquida em ${monthLabel(peak.month_start)} (${formatPct(peak.net_margin_pct)})`,
    );
  }

  const direction =
    series.previousYtdNet != null ? (series.ytdNet >= series.previousYtdNet ? "up" : "down") : null;

  return { message: parts.join(" · "), direction };
}

export function buildExpenseInsight(rows: { account_name: string; total: number }[]): YoYInsight {
  if (rows.length === 0) return { message: "Sem despesas no período.", direction: null };
  const total = rows.reduce((s, r) => s + r.total, 0);
  const top = rows[0];
  if (!top) return { message: "Sem despesas no período.", direction: null };
  const pct = total ? (top.total / total) * 100 : 0;
  const concentration =
    pct >= 40 ? "alta concentração" : pct >= 25 ? "concentração média" : "distribuição equilibrada";
  return {
    message: `${rows.length} categoria(s) totalizando ${formatBRL(total)} — top categoria "${top.account_name}" responde por ${formatPct(pct)} (${concentration}).`,
    direction: null,
  };
}
