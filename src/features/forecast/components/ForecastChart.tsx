import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { ForecastDay } from "../api";

interface Props {
  data: ForecastDay[];
  loading: boolean;
}

export function ForecastChart({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-[340px] w-full" />;

  if (data.length === 0) {
    return (
      <div className="grid h-[340px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-border text-sm text-text-muted">
        Nenhuma projeção disponível.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label: formatDate(d.day, "dd/MM"),
    day: d.day,
    inflow: d.inflowExpected + d.inflowRecurring,
    outflow: -(d.outflowExpected + d.outflowRecurring),
    balance: d.runningBalance,
  }));

  return (
    <div className="h-[340px] rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            yAxisId="flow"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            tickFormatter={(v: number) => formatBRL(v, { compact: true })}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="balance"
            orientation="right"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            tickFormatter={(v: number) => formatBRL(v, { compact: true })}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine
            y={0}
            yAxisId="balance"
            stroke="var(--color-expense)"
            strokeDasharray="3 3"
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [formatBRL(Math.abs(value)), name]}
            labelFormatter={(label: string, items: readonly { payload?: { day?: string } }[]) => {
              const day = items[0]?.payload?.day;
              return day ? formatDate(day) : label;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            yAxisId="balance"
            type="monotone"
            dataKey="balance"
            name="Saldo projetado"
            stroke="var(--color-accent)"
            strokeWidth={2}
            fill="url(#balanceFill)"
          />
          <Line
            yAxisId="flow"
            type="monotone"
            dataKey="inflow"
            name="Entradas"
            stroke="var(--color-income)"
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            yAxisId="flow"
            type="monotone"
            dataKey="outflow"
            name="Saídas"
            stroke="var(--color-expense)"
            strokeWidth={1.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
