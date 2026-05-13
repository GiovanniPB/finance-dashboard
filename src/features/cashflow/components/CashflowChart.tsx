import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMonthYear } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { CashflowGranularity, CashflowPeriodWithBalance } from "../types";

interface Props {
  data: CashflowPeriodWithBalance[] | null;
  loading: boolean;
  granularity: CashflowGranularity;
}

export function CashflowChart({ data, loading, granularity }: Props) {
  if (loading) return <Skeleton className="h-[340px] w-full" />;

  if (!data || data.length === 0) {
    return (
      <div className="grid h-[340px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-border text-sm text-text-muted">
        Nenhuma movimentação no período selecionado.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label:
      granularity === "monthly"
        ? formatMonthYear(d.bucket).split(" ")[0]
        : formatDate(d.bucket, "dd/MM"),
    bucket: d.bucket,
    inflow: d.inflow,
    outflow: -d.outflow, // negative so bars go down
    net: d.net,
    cumulative: d.cumulative,
  }));

  return (
    <div className="h-[340px] rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="flow"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatBRL(v, { compact: true })}
          />
          <YAxis
            yAxisId="balance"
            orientation="right"
            tick={{ fill: "var(--color-accent)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatBRL(v, { compact: true })}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                inflow: "Entradas",
                outflow: "Saídas",
                net: "Líquido",
                cumulative: "Acumulado",
              };
              return [formatBRL(Math.abs(value)), labels[name] ?? name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="flow"
            dataKey="inflow"
            name="Entradas"
            fill="var(--color-income)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            yAxisId="flow"
            dataKey="outflow"
            name="Saídas"
            fill="var(--color-expense)"
            radius={[0, 0, 4, 4]}
          />
          <Line
            yAxisId="balance"
            type="monotone"
            dataKey="cumulative"
            name="Acumulado"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
