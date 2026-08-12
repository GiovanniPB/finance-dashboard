import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

import type { BankAccount } from "../api";

const TYPE_LABELS: Record<string, string> = {
  checking: "Corrente",
  savings: "Poupança",
  cdb_automatic: "CDB Resgate Auto",
  cdb_daily: "CDB Liquidação D",
  cdb_term: "CDB Prazo",
  investment_fund: "Fundo",
  cash: "Caixa",
  payment_gateway: "Gateway",
};

interface Props {
  rows: BankAccount[];
  loading: boolean;
  onEdit: (a: BankAccount) => void;
  onToggleActive: (a: BankAccount) => void;
  onDelete: (a: BankAccount) => void;
}

export function BankAccountsTable({ rows, loading, onEdit, onToggleActive, onDelete }: Props) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
        Nenhuma conta bancária cadastrada nesta empresa.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2/60">
          <tr className="border-b border-border">
            <Th>Apelido</Th>
            <Th>Banco</Th>
            <Th>Tipo</Th>
            <Th align="right">Saldo inicial</Th>
            <Th align="right">Status</Th>
            <Th align="right">Ações</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "border-b border-border last:border-0 hover:bg-surface-2/50",
                !row.is_active && "opacity-60",
              )}
            >
              <td className="px-4 py-3 font-medium">{row.nickname}</td>
              <td className="px-4 py-3 text-text-muted">{row.bank_name}</td>
              <td className="px-4 py-3 text-text-muted">
                {TYPE_LABELS[row.account_type] ?? row.account_type}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {formatBRL(row.initial_balance)}
              </td>
              <td className="px-4 py-3 text-right">
                {row.is_active ? (
                  <Badge tone="income">Ativa</Badge>
                ) : (
                  <Badge tone="default">Inativa</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Ações"
                      className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-2 hover:text-text"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onEdit(row)}>
                      <Pencil className="size-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onToggleActive(row)}>
                      <Power className="size-4" /> {row.is_active ? "Desativar" : "Ativar"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => onDelete(row)}
                      className="text-expense focus:bg-expense-soft focus:text-expense"
                    >
                      <Trash2 className="size-4" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
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
