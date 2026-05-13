import { Link } from "react-router-dom";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDate, formatMonthYear } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { CashflowGranularity, CashflowPeriodWithBalance } from "../types";

interface Props {
  data: CashflowPeriodWithBalance[] | null;
  loading: boolean;
  granularity: CashflowGranularity;
  companyId: string | null;
}

export function CashflowTable({ data, loading, granularity, companyId }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-8 text-center text-sm text-text-muted">
        Sem dados para o período.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2/60">
          <tr className="border-b border-border">
            <Th align="left">{granularity === "monthly" ? "Mês" : "Dia"}</Th>
            <Th align="right">Entradas</Th>
            <Th align="right">Saídas</Th>
            <Th align="right">Líquido</Th>
            <Th align="right">Acumulado</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const drillUrl = buildDrillUrl(row.bucket, granularity, companyId);
            return (
              <tr
                key={row.bucket}
                className="border-b border-border last:border-0 hover:bg-surface-2/50"
              >
                <td className="px-4 py-2.5">
                  {drillUrl ? (
                    <Link to={drillUrl} className="hover:text-accent hover:underline">
                      {granularity === "monthly"
                        ? formatMonthYear(row.bucket)
                        : formatDate(row.bucket)}
                    </Link>
                  ) : (
                    <span>
                      {granularity === "monthly"
                        ? formatMonthYear(row.bucket)
                        : formatDate(row.bucket)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-income tabular-nums">
                  {row.inflow > 0 ? formatBRL(row.inflow) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-expense tabular-nums">
                  {row.outflow > 0 ? formatBRL(row.outflow) : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-mono font-medium tabular-nums",
                    row.net > 0 && "text-income",
                    row.net < 0 && "text-expense",
                    row.net === 0 && "text-text-subtle",
                  )}
                >
                  {row.net > 0 ? "+" : ""}
                  {formatBRL(row.net)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-accent tabular-nums">
                  {formatBRL(row.cumulative)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: "left" | "right" }) {
  return (
    <th
      className={cn(
        "text-2xs px-4 py-2.5 font-medium tracking-wide text-text-subtle uppercase",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function buildDrillUrl(
  bucket: string,
  granularity: CashflowGranularity,
  companyId: string | null,
): string | null {
  if (!companyId) return null;
  const params = new URLSearchParams();
  if (granularity === "monthly") {
    // bucket is the first day of the month; compute end of month
    const d = new Date(`${bucket}T00:00:00`);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    params.set("from", bucket);
    params.set("to", end.toISOString().slice(0, 10));
  } else {
    params.set("from", bucket);
    params.set("to", bucket);
  }
  return `/transactions?${params.toString()}`;
}
