import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatBRL } from "@/lib/format";

export interface YoYAreaDatum {
  month: string;
  current: number;
  previous: number;
}

interface Props {
  data: YoYAreaDatum[];
  currentLabel: string;
  previousLabel: string;
  currentColor?: string;
  /** Whether to show legend at the top. Default false. */
  showLegend?: boolean;
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `R$ ${Math.round(value / 1_000)}k`;
  return formatBRL(value);
}

export default function YoYAreaChart({
  data,
  currentLabel,
  previousLabel,
  currentColor = "var(--color-accent)",
  showLegend = false,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="yoyCurrent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={currentColor} stopOpacity={0.45} />
            <stop offset="100%" stopColor={currentColor} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="yoyPrevious" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(70% 0.01 264)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="oklch(70% 0.01 264)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
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
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            fontSize: 12,
          }}
          formatter={(value: number, name: string) => [formatBRL(value), name]}
        />
        {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
        <Area
          type="monotone"
          dataKey="previous"
          name={previousLabel}
          stroke="oklch(70% 0.01 264)"
          strokeWidth={2}
          fill="url(#yoyPrevious)"
        />
        <Area
          type="monotone"
          dataKey="current"
          name={currentLabel}
          stroke={currentColor}
          strokeWidth={2.5}
          fill="url(#yoyCurrent)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
