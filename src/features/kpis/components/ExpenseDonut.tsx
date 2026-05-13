import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatBRL } from "@/lib/format";

interface Props {
  data: { account_name: string; total: number; is_other: boolean }[];
}

const PALETTE = [
  "oklch(58% 0.22 285)", // accent violet
  "oklch(64% 0.20 250)", // blue-violet
  "oklch(62% 0.20 220)", // blue
  "oklch(62% 0.18 195)", // teal
  "oklch(60% 0.16 158)", // green (income)
  "oklch(73% 0.16 75)", // amber
  "oklch(64% 0.20 24)", // red-orange (expense)
  "oklch(65% 0.18 340)", // pink
  "oklch(55% 0.05 264)", // neutral gray (for "Outros")
];

export default function ExpenseDonut({ data }: Props) {
  const total = data.reduce((acc, d) => acc + d.total, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="account_name"
          innerRadius={64}
          outerRadius={104}
          paddingAngle={1}
          stroke="var(--color-surface)"
          strokeWidth={2}
        >
          {data.map((entry, i) => (
            <Cell
              key={`${entry.account_name ?? "outros"}-${i}`}
              fill={
                entry.is_other ? PALETTE[PALETTE.length - 1] : PALETTE[i % (PALETTE.length - 1)]
              }
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            fontSize: 12,
          }}
          formatter={(value: number, name: string) => [
            `${formatBRL(value)} (${total ? ((value / total) * 100).toFixed(1) : 0}%)`,
            name,
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
