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

import { formatBRL } from "@/lib/format";

export interface YoYBarDatum {
  month: string;
  current: number;
  previous: number;
}

interface Props {
  data: YoYBarDatum[];
  currentLabel: string;
  previousLabel: string;
  /** Hex/oklch color for current series (defaults to var(--color-accent)). */
  currentColor?: string;
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `R$ ${Math.round(value / 1_000)}k`;
  return formatBRL(value);
}

export default function YoYBarChart({
  data,
  currentLabel,
  previousLabel,
  currentColor = "var(--color-accent)",
}: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--color-text-subtle)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatCompact}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "var(--color-surface-2)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            fontSize: 12,
          }}
          formatter={(value: number, name: string) => [formatBRL(value), name]}
        />
        <Bar dataKey="previous" name={previousLabel} radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((_, i) => (
            <Cell key={`p-${i}`} fill="oklch(70% 0.01 264)" fillOpacity={0.55} />
          ))}
        </Bar>
        <Bar dataKey="current" name={currentLabel} radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((_, i) => (
            <Cell key={`c-${i}`} fill={currentColor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
