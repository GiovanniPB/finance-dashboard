/**
 * Histórico de uma linha do balanço, mês a mês.
 *
 * Segue o período selecionado na tela — o gráfico é a mesma linha da matriz vista
 * como série, então divergir do filtro seria confuso.
 *
 * Valor em dinheiro vai como barra (comparação entre meses, com base no zero para
 * negativo não distorcer); percentual vai como linha, que é como se lê tendência
 * de margem.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/cn";
import { formatMonthYear } from "@/lib/dates";
import { formatBRL, formatPercent } from "@/lib/format";

import type { BalanceMatrixLine } from "../compute";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: BalanceMatrixLine | null;
  months: string[];
  periodLabel: string;
}

interface Point {
  month: string;
  value: number | null;
}

const AXIS_TICK = { fill: "var(--color-text-muted)", fontSize: 11 };

const TOOLTIP_STYLE = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  fontSize: 12,
};

/**
 * O Recharts pinta o texto do item do tooltip com a cor da série. Como a cor das
 * barras vem dos `<Cell>` e não de um `fill` no `<Bar>`, ele não acha cor nenhuma
 * e cai no preto padrão — invisível no tema escuro. Fixar nos tokens de texto
 * resolve nos dois temas e independe de como a barra foi colorida.
 */
const TOOLTIP_ITEM_STYLE = { color: "var(--color-text)" };
const TOOLTIP_LABEL_STYLE = { color: "var(--color-text-muted)", marginBottom: 2 };

/** O realce padrão do Recharts é um cinza claro fixo, que estoura no escuro. */
const TOOLTIP_CURSOR = { fill: "var(--color-surface-2)" };

export function BalanceLineChartDialog({ open, onOpenChange, line, months, periodLabel }: Props) {
  const isPercent = line?.format === "percent";

  const data: Point[] = months.map((month, index) => ({
    month: formatMonthYear(month),
    value: line?.values[index] ?? null,
  }));

  const formatValue = (value: number) =>
    isPercent ? formatPercent(value, { fromHundred: true }) : formatBRL(value);

  const defined = data.filter((p) => p.value != null);
  const best = defined.reduce<Point | null>(
    (acc, p) => (acc == null || (p.value ?? 0) > (acc.value ?? 0) ? p : acc),
    null,
  );
  const worst = defined.reduce<Point | null>(
    (acc, p) => (acc == null || (p.value ?? 0) < (acc.value ?? 0) ? p : acc),
    null,
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2",
            "rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]",
            "data-[state=closed]:animate-out data-[state=open]:animate-in",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="font-display text-base font-semibold">
                {line?.label ?? "—"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-2xs mt-0.5 text-text-muted">
                Evolução mês a mês · {periodLabel}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar"
              className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Total do período" value={line ? formatCell(line, line.total) : "—"} />
            <Stat
              label="Melhor mês"
              value={best ? `${best.month} · ${formatValue(best.value ?? 0)}` : "—"}
            />
            <Stat
              label="Pior mês"
              value={worst ? `${worst.month} · ${formatValue(worst.value ?? 0)}` : "—"}
            />
          </div>

          <div className="mt-4 h-72 w-full">
            {months.length === 0 ? (
              <p className="grid h-full place-items-center text-sm text-text-muted">
                Sem meses no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {isPercent ? (
                  <LineChart data={data}>
                    <CartesianGrid
                      stroke="var(--color-border)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatPercent(v, { fromHundred: true })}
                    />
                    <ReferenceLine y={0} stroke="var(--color-border-strong)" />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      cursor={{ stroke: "var(--color-border-strong)" }}
                      formatter={(v: number) => formatPercent(v, { fromHundred: true })}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={line?.label ?? ""}
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                ) : (
                  <BarChart data={data}>
                    <CartesianGrid
                      stroke="var(--color-border)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatBRL(v, { compact: true })}
                    />
                    <ReferenceLine y={0} stroke="var(--color-border-strong)" />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      cursor={TOOLTIP_CURSOR}
                      formatter={(v: number) => formatBRL(v)}
                    />
                    <Bar dataKey="value" name={line?.label ?? ""} radius={[6, 6, 0, 0]}>
                      {data.map((point) => (
                        <Cell
                          key={point.month}
                          fill={
                            (point.value ?? 0) < 0 ? "var(--color-expense)" : "var(--color-accent)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>

          {months.length === 1 && (
            <p className="text-2xs mt-2 text-text-muted">
              O período tem um mês só — amplie o filtro para ver a evolução.
            </p>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function formatCell(line: BalanceMatrixLine, value: number | null): string {
  if (value == null) return "—";
  return line.format === "percent" ? formatPercent(value, { fromHundred: true }) : formatBRL(value);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2/50 px-3 py-2">
      <div className="text-2xs tracking-wide text-text-subtle uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}
