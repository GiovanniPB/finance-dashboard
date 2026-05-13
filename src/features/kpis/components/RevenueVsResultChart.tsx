import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatBRL } from "@/lib/format";

interface Props {
  data: { month: string; receita: number; resultado: number }[];
}

export default function RevenueVsResultChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
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
          formatter={(v: number) => formatBRL(v)}
        />
        <Bar
          dataKey="receita"
          name="Venda Bruta"
          fill="var(--color-accent)"
          radius={[6, 6, 0, 0]}
        />
        <Bar
          dataKey="resultado"
          name="Resultado Líquido"
          fill="var(--color-income)"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
