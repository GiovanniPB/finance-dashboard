import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatBRL, formatNumber, formatPercent } from "@/lib/format";

import type { SalesBreakdownRow } from "../../api";
import { sumAmount } from "./labels";
import { seriesColor, TOOLTIP_STYLE } from "./shared";

interface Props {
  rows: SalesBreakdownRow[];
  /** Converte o valor cru da API no rótulo que o usuário lê. */
  labelOf: (raw: string) => string;
}

/**
 * Rosca + legenda com valor.
 *
 * Escolhida para as dimensões NOMINAIS de poucas categorias (meio de pagamento,
 * bandeira), onde a pergunta é "que fatia do total cada uma representa". Para
 * parcelamento seria a escolha errada: lá a ordem 1x…12x carrega significado, e a
 * rosca a destrói.
 */
export function DonutComposition({ rows, labelOf }: Props) {
  const total = sumAmount(rows);
  const data = rows.map((r, i) => ({
    name: labelOf(r.label),
    value: r.amount,
    count: r.salesCount,
    fill: seriesColor(i),
  }));

  return (
    <div className="flex h-full flex-col items-center gap-4 sm:flex-row">
      <div className="h-[160px] w-full shrink-0 sm:h-full sm:w-[45%]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="var(--color-surface)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number, name) => [formatBRL(v), name as string]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2 self-center">
        {data.map((d) => (
          <li key={d.name} className="flex items-baseline gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 translate-y-0.5 rounded-[3px]"
              style={{ backgroundColor: d.fill }}
            />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="shrink-0 text-right tabular-nums">
              {formatBRL(d.value)}
              <span className="ml-2 text-xs text-text-muted">
                {formatPercent(total > 0 ? d.value / total : 0)} · {formatNumber(d.count)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
