import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import { balanceRange, type BalancePoint } from "../compute";

interface Props {
  data: BalancePoint[];
  loading: boolean;
}

export function AccountBalanceChart({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-[260px] w-full" />;

  // Um ponto só (apenas a abertura) não desenha uma evolução.
  if (data.length < 2) {
    return (
      <div className="grid h-[260px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-border text-sm text-text-muted">
        Sem movimentação suficiente para desenhar a evolução do saldo.
      </div>
    );
  }

  const range = balanceRange(data);
  const hasNegative = (range?.min ?? 0) < 0;

  const chartData = data.map((p) => ({
    ...p,
    label: formatDate(p.date, "dd/MM"),
  }));

  return (
    <div className="h-[260px] rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={72}
            tickFormatter={(v: number) => formatBRL(v, { compact: true })}
          />
          {hasNegative && (
            <ReferenceLine y={0} stroke="var(--color-expense)" strokeDasharray="4 4" />
          )}
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(_label: string, payload) => {
              const point = payload?.[0]?.payload as BalancePoint | undefined;
              if (!point) return "";
              const movement = [
                point.inflow > 0 ? `+${formatBRL(point.inflow)}` : null,
                point.outflow > 0 ? `−${formatBRL(point.outflow)}` : null,
              ]
                .filter(Boolean)
                .join("   ");
              return movement ? `${formatDate(point.date)} · ${movement}` : formatDate(point.date);
            }}
            formatter={(value: number) => [formatBRL(value), "Saldo"]}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            fill="url(#balanceFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
