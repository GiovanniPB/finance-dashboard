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
import { formatBRL, formatNumber } from "@/lib/format";

import type { SalesGrain, SalesTimeseriesPoint } from "../api";

interface Props {
  data: SalesTimeseriesPoint[] | undefined;
  loading: boolean;
  grain: SalesGrain;
}

export function SalesEvolutionChart({ data, loading, grain }: Props) {
  if (loading) return <Skeleton className="h-[340px] w-full" />;

  const hasSales = (data ?? []).some((d) => d.salesCount > 0);
  if (!data || !hasSales) {
    return (
      <div className="grid h-[340px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-border text-sm text-text-muted">
        Nenhuma venda no período selecionado.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    label:
      grain === "month" ? formatMonthYear(d.bucket).split(" ")[0] : formatDate(d.bucket, "dd/MM"),
    gmv: d.gmv,
    salesCount: d.salesCount,
    failedCount: d.failedCount,
  }));

  return (
    <div className="h-[340px] rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            stroke="var(--color-border)"
          />
          <YAxis
            yAxisId="money"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            stroke="var(--color-border)"
            tickFormatter={(v: number) => formatBRL(v, { compact: true })}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            stroke="var(--color-border)"
            tickFormatter={(v: number) => formatNumber(v)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
            formatter={(value: number, name: string) =>
              name === "Faturamento" ? formatBRL(value) : formatNumber(value)
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="money"
            dataKey="gmv"
            name="Faturamento"
            fill="var(--color-accent)"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="salesCount"
            name="Nº de vendas"
            stroke="var(--color-income)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="failedCount"
            name="Recusadas"
            stroke="var(--color-expense)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
