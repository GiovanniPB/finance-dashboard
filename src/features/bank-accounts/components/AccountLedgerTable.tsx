import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { LedgerEntry } from "../api";

interface Props {
  data: LedgerEntry[] | undefined;
  loading: boolean;
  /** Saldo antes da primeira linha, mostrado como linha de abertura. */
  openingBalance: number | undefined;
  from: string;
}

export function AccountLedgerTable({ data, loading, openingBalance, from }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-8 text-center text-sm text-text-muted">
        Nenhum lançamento liquidado nesta conta no período.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-surface-2/60">
          <tr className="border-b border-border">
            <Th align="left">Data</Th>
            <Th align="left">Descrição</Th>
            <Th align="left">Categoria</Th>
            <Th align="right">Valor</Th>
            <Th align="right">Saldo</Th>
          </tr>
        </thead>
        <tbody>
          {openingBalance !== undefined && (
            <tr className="border-b border-border bg-surface-2/30">
              <td className="px-4 py-2.5 text-text-muted">{formatDate(from)}</td>
              <td className="px-4 py-2.5 text-text-muted italic" colSpan={2}>
                Saldo anterior
              </td>
              <td className="px-4 py-2.5 text-right text-text-subtle">—</td>
              <td
                className={cn(
                  "px-4 py-2.5 text-right font-mono font-medium tabular-nums",
                  openingBalance < 0 ? "text-expense" : "text-text-muted",
                )}
              >
                {formatBRL(openingBalance)}
              </td>
            </tr>
          )}
          {data.map((row) => (
            <tr
              key={row.transaction_id}
              className="border-b border-border last:border-0 hover:bg-surface-2/50"
            >
              <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(row.cash_date)}</td>
              <td className="px-4 py-2.5">
                <div className="font-medium">{row.description}</div>
                {(row.counterparty_name ?? row.document_ref) && (
                  <div className="text-2xs text-text-subtle">
                    {[row.counterparty_name, row.document_ref].filter(Boolean).join(" · ")}
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs text-text-muted">
                {row.account_name ? (
                  <span title={row.account_code ?? undefined}>{row.account_name}</span>
                ) : (
                  "—"
                )}
              </td>
              <td
                className={cn(
                  "px-4 py-2.5 text-right font-mono font-medium whitespace-nowrap tabular-nums",
                  row.direction === "inflow" ? "text-income" : "text-expense",
                )}
              >
                {row.direction === "inflow" ? "+" : "−"}
                {formatBRL(row.amount)}
              </td>
              <td
                className={cn(
                  "px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap tabular-nums",
                  row.running_balance < 0 ? "text-expense" : "text-text",
                )}
              >
                {formatBRL(row.running_balance)}
              </td>
            </tr>
          ))}
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
