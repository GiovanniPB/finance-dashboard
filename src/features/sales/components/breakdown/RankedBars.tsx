import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatBRL, formatNumber } from "@/lib/format";

import type { SalesBreakdownRow } from "../../api";
import { AXIS_TICK, seriesColor, TOOLTIP_STYLE } from "./shared";

interface Props {
  rows: SalesBreakdownRow[];
  /** Quantos itens mostrar antes de agrupar o resto. */
  limit?: number;
  labelOf?: (raw: string) => string;
  /** Largura do eixo de rótulos — plano precisa de mais que empresa. */
  labelWidth?: number;
  color?: (index: number) => string;
}

const truncate = (v: string, max: number): string =>
  v.length > max ? `${v.slice(0, max - 1)}…` : v;

/**
 * Barras horizontais em ranking.
 *
 * Para dimensões com MUITAS categorias e rótulos longos (plano/produto), onde a
 * pergunta é "quais são os maiores". Horizontal porque rótulo de texto longo cabe
 * no eixo Y sem rotacionar.
 */
export function RankedBars({
  rows,
  limit = 8,
  labelOf = (v) => v,
  labelWidth = 130,
  color = seriesColor,
}: Props) {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);

  // Sem isto, uma cauda longa simplesmente sumia e o total do card não fechava
  // com a soma das barras.
  const data = [
    ...head.map((r) => ({
      name: labelOf(r.label),
      amount: r.amount,
      count: r.salesCount,
    })),
    ...(tail.length > 0
      ? [
          {
            name: `Outros (${tail.length})`,
            amount: tail.reduce((acc, r) => acc + r.amount, 0),
            count: tail.reduce((acc, r) => acc + r.salesCount, 0),
          },
        ]
      : []),
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          tick={AXIS_TICK}
          stroke="var(--color-border)"
          tickFormatter={(v: number) => formatBRL(v, { compact: true })}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          tick={AXIS_TICK}
          stroke="var(--color-border)"
          tickFormatter={(v: string) => truncate(v, Math.floor(labelWidth / 7))}
        />
        <Tooltip
          cursor={{ fill: "var(--color-surface-2)" }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number, _n, item) => [
            `${formatBRL(v)} · ${formatNumber((item?.payload as { count: number } | undefined)?.count ?? 0)} venda(s)`,
            "",
          ]}
        />
        <Bar dataKey="amount" radius={[0, 3, 3, 0]} maxBarSize={22}>
          {data.map((d, i) => (
            <Cell
              key={d.name}
              fill={d.name.startsWith("Outros (") ? "var(--color-text-subtle)" : color(i)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
