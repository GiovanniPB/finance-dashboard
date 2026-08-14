import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatBRL, formatNumber, formatPercent } from "@/lib/format";

import type { SalesBreakdownRow } from "../../api";
import { installmentOrder, sumAmount } from "./labels";
import { AXIS_TICK, BreakdownCard, TOOLTIP_STYLE, TotalAside } from "./shared";

interface Props {
  data: SalesBreakdownRow[] | undefined;
  loading: boolean;
}

/**
 * Parcelamento — dimensão ORDINAL: 1x…12x tem sequência, e a forma da
 * distribuição é a informação (concentra à vista? espalha até 12x?).
 *
 * Por isso barra ordenada pela parcela, e não por valor: ranquear por valor —
 * como o card único fazia — embaralhava a sequência e escondia justamente o
 * padrão de financiamento que interessa.
 */
export function SalesByInstallments({ data, loading }: Props) {
  const rows = [...(data ?? [])].sort(
    (a, b) => installmentOrder(a.label) - installmentOrder(b.label),
  );
  const total = sumAmount(rows);
  const aVista = rows.find((r) => r.label === "à vista")?.amount ?? 0;

  const chart = rows.map((r) => ({
    name: r.label,
    amount: r.amount,
    count: r.salesCount,
    // parcelado é financiamento: destaca do à vista, que é caixa imediato
    fill: r.label === "à vista" ? "var(--color-chart-3)" : "var(--color-chart-1)",
  }));

  return (
    <BreakdownCard
      title="Parcelamento"
      description="Em quantas vezes a venda foi feita — a curva do que vira recebível futuro."
      loading={loading}
      isEmpty={rows.length === 0}
      aside={
        <TotalAside
          value={total}
          hint={`${formatPercent(total > 0 ? aVista / total : 0)} à vista`}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} stroke="var(--color-border)" />
          <YAxis
            tick={AXIS_TICK}
            stroke="var(--color-border)"
            tickFormatter={(v: number) => formatBRL(v, { compact: true })}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-2)" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, _n, item) => [
              `${formatBRL(v)} · ${formatNumber((item?.payload as { count: number } | undefined)?.count ?? 0)} venda(s)`,
              "",
            ]}
          />
          <Bar dataKey="amount" radius={[3, 3, 0, 0]} maxBarSize={44}>
            {chart.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </BreakdownCard>
  );
}
