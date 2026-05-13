import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { formatBRL } from "@/lib/format";

interface Props {
  data: { month: string; receita: number }[];
}

export default function HeroRevenueChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={0.55} />
            <stop offset="100%" stopColor="white" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="month"
          tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(0,0,0,0.7)",
            border: "none",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "white" }}
          formatter={(v: number) => formatBRL(v)}
        />
        <Area type="monotone" dataKey="receita" stroke="white" strokeWidth={2} fill="url(#rev)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
