import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

import type { DreComputedRow } from "../types";

interface Props {
  rows: DreComputedRow[] | null;
  loading: boolean;
  /** When set, account rows link to /transactions filtered to that account in the given period. */
  drillDown?: {
    period: { from: string; to: string };
    companyId: string | null;
  };
}

export function DreTable({ rows, loading, drillDown }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
        Nenhum lançamento no período selecionado.
      </div>
    );
  }

  const aboveTheLine = rows.filter((r) => !r.below_the_line);
  const belowTheLine = rows.filter((r) => r.below_the_line);

  return (
    <div className="space-y-6">
      <Section rows={aboveTheLine} drillDown={drillDown} />
      {belowTheLine.length > 0 && (
        <div>
          <div className="text-2xs mb-2 font-medium tracking-wide text-text-subtle uppercase">
            Movimentações de capital (abaixo da linha)
          </div>
          <Section rows={belowTheLine} drillDown={drillDown} />
        </div>
      )}
    </div>
  );
}

function Section({ rows, drillDown }: { rows: DreComputedRow[]; drillDown?: Props["drillDown"] }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <DreRowItem key={row.account_id} row={row} drillDown={drillDown} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DreRowItem({ row, drillDown }: { row: DreComputedRow; drillDown?: Props["drillDown"] }) {
  const isPositiveSign = row.sign_hint === "+";
  const isNegativeSign = row.sign_hint === "-";
  const isTotalizer = row.sign_hint === "=";
  const isTopLevel = row.depth === 0 && row.is_summary;

  const SignIcon = isPositiveSign ? ArrowUpRight : isNegativeSign ? ArrowDownRight : Minus;

  const isZero = row.effective_total === 0;
  const isNegative = row.effective_total < 0;

  const showDrill =
    drillDown && !row.is_summary && row.parent_id !== null
      ? buildDrillUrl(row.account_id, drillDown)
      : null;

  return (
    <tr
      className={cn(
        "border-b border-border last:border-0",
        isTopLevel && "bg-surface-2/60",
        row.is_summary && "font-medium",
        isTotalizer && "border-y-2 border-border bg-accent-soft/30",
      )}
    >
      <td className="py-2.5 pl-4 align-middle" style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-2xs grid size-5 place-items-center rounded-[var(--radius-xs)]",
              isPositiveSign && "bg-income-soft text-income",
              isNegativeSign && "bg-expense-soft text-expense",
              isTotalizer && "bg-accent-soft text-accent",
              !row.sign_hint && "text-text-subtle",
            )}
          >
            {row.sign_hint === "+/-" ? (
              <Minus className="size-3" />
            ) : (
              <SignIcon className="size-3" />
            )}
          </span>
          {showDrill ? (
            <Link
              to={showDrill}
              className={cn(
                "truncate hover:text-accent hover:underline",
                isZero && "text-text-subtle",
              )}
              title="Ver lançamentos desta conta no período"
            >
              {row.name}
            </Link>
          ) : (
            <span
              className={cn(
                "truncate",
                row.is_summary ? "text-text" : isZero ? "text-text-subtle" : "text-text-muted",
              )}
            >
              {row.name}
            </span>
          )}
        </div>
      </td>
      <td className="hidden px-3 py-2.5 align-middle md:table-cell">
        <span className="text-2xs font-mono text-text-subtle">{row.code}</span>
      </td>
      <td className="py-2.5 pr-4 pl-3 text-right align-middle">
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            row.is_summary && "font-semibold",
            isTotalizer && "text-accent",
            isZero && !row.is_summary && "text-text-subtle",
            !isTotalizer && isNegative && "text-expense",
            !isTotalizer && !isNegative && !isZero && !row.is_summary && "text-text",
            !isTotalizer && row.is_summary && !isNegative && "text-text",
          )}
        >
          {formatBRL(row.effective_total)}
        </span>
      </td>
    </tr>
  );
}

function buildDrillUrl(
  accountId: string,
  drillDown: { period: { from: string; to: string }; companyId: string | null },
): string {
  const params = new URLSearchParams();
  params.set("accountId", accountId);
  if (drillDown.period.from) params.set("from", drillDown.period.from);
  if (drillDown.period.to) params.set("to", drillDown.period.to);
  return `/transactions?${params.toString()}`;
}
