import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownRight, ArrowUpDown, ArrowUpRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { TransactionWithRelations } from "../types";
import { TransactionStatusBadge } from "./TransactionStatusBadge";

interface Props {
  rows: TransactionWithRelations[];
  loading: boolean;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (sortBy: string, sortOrder: "asc" | "desc") => void;
  showCompany: boolean;
}

export function TransactionsTable({
  rows,
  loading,
  sortBy,
  sortOrder,
  onSortChange,
  showCompany,
}: Props) {
  const sorting = React.useMemo<SortingState>(
    () => [{ id: sortBy, desc: sortOrder === "desc" }],
    [sortBy, sortOrder],
  );

  const columns = React.useMemo<ColumnDef<TransactionWithRelations>[]>(() => {
    const cols: ColumnDef<TransactionWithRelations>[] = [
      {
        accessorKey: "accrual_date",
        header: "Competência",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-xs whitespace-nowrap text-text-muted">
            {formatDate(row.original.accrual_date)}
          </span>
        ),
      },
      {
        accessorKey: "cash_date",
        header: "Caixa",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-xs whitespace-nowrap text-text-subtle">
            {row.original.cash_date ? formatDate(row.original.cash_date) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "description",
        header: "Descrição",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex max-w-[420px] flex-col">
            <span className="truncate text-sm text-text">{row.original.description}</span>
            {row.original.counterparty && (
              <span className="text-2xs truncate text-text-subtle">
                {row.original.counterparty.name}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "account",
        header: "Conta",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.account ? (
            <div className="flex max-w-[260px] flex-col">
              <span className="truncate text-xs text-text-muted">{row.original.account.name}</span>
              <span className="text-2xs font-mono text-text-subtle">
                {row.original.account.code}
              </span>
            </div>
          ) : (
            <span className="text-2xs text-text-subtle">—</span>
          ),
      },
    ];

    if (showCompany) {
      cols.push({
        id: "company",
        header: "Empresa",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-text-muted">
            {row.original.company?.trade_name ?? row.original.company?.legal_name ?? "—"}
          </span>
        ),
      });
    }

    cols.push(
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => <TransactionStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "amount",
        header: "Valor",
        enableSorting: true,
        cell: ({ row }) => {
          const isInflow = row.original.direction === "inflow";
          const Icon = isInflow ? ArrowUpRight : ArrowDownRight;
          return (
            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
              <Icon className={cn("size-3.5", isInflow ? "text-income" : "text-expense")} />
              <span
                className={cn(
                  "font-mono text-sm font-medium tabular-nums",
                  isInflow ? "text-income" : "text-expense",
                )}
              >
                {isInflow ? "+" : "-"} {formatBRL(row.original.amount)}
              </span>
            </div>
          );
        },
      },
    );
    return cols;
  }, [showCompany]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      if (first) onSortChange(first.id, first.desc ? "desc" : "asc");
    },
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-2/60">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((h) => {
                const canSort = h.column.getCanSort();
                const isAmount = h.id === "amount";
                return (
                  <th
                    key={h.id}
                    onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                    className={cn(
                      "text-2xs px-4 py-2.5 font-medium tracking-wide text-text-subtle uppercase",
                      isAmount ? "text-right" : "text-left",
                      canSort && "cursor-pointer select-none hover:text-text",
                    )}
                  >
                    <span
                      className={cn("inline-flex items-center gap-1", isAmount && "justify-end")}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {canSort && <ArrowUpDown className="size-3 opacity-50" />}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {columns.map((_c, j) => (
                  <td key={j} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-16 text-center text-sm text-text-muted"
              >
                Nenhum lançamento encontrado para os filtros selecionados.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border transition-colors last:border-0 hover:bg-surface-2/50"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
