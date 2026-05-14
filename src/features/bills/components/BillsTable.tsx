import { CheckCircle2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { BillEffectiveStatus, BillWithRelations } from "../types";
import { BillStatusBadge } from "./BillStatusBadge";

interface Props {
  rows: BillWithRelations[];
  loading: boolean;
  canEdit: boolean;
  onEdit: (bill: BillWithRelations) => void;
  onDelete: (bill: BillWithRelations) => void;
  onPay: (bill: BillWithRelations) => void;
}

export function BillsTable({ rows, loading, canEdit, onEdit, onDelete, onPay }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-[var(--radius-md)] border border-border bg-surface p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
        Nenhum título encontrado para os filtros atuais.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2">
          <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            <th className="px-3 py-2.5 text-left">Vencimento</th>
            <th className="px-3 py-2.5 text-left">Descrição</th>
            <th className="px-3 py-2.5 text-left">Conta</th>
            <th className="px-3 py-2.5 text-left">Status</th>
            <th className="px-3 py-2.5 text-right">Valor</th>
            <th className="px-3 py-2.5 text-right">Em aberto</th>
            <th className="w-12 px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((bill) => {
            const status = (bill.effective_status ?? "open") as BillEffectiveStatus;
            const isPaid = status === "paid" || status === "canceled";
            return (
              <tr key={bill.id} className={cn("hover:bg-surface-2/60", isPaid && "opacity-60")}>
                <td className="px-3 py-2.5">
                  <div className="font-mono text-xs whitespace-nowrap">
                    {bill.due_date ? formatDate(bill.due_date) : "—"}
                  </div>
                  {bill.installment_n && bill.installment_total ? (
                    <div className="text-2xs text-text-subtle">
                      Parcela {bill.installment_n}/{bill.installment_total}
                    </div>
                  ) : null}
                </td>
                <td className="max-w-[360px] px-3 py-2.5">
                  <div className="truncate">{bill.description}</div>
                  {bill.counterparty && (
                    <div className="text-2xs truncate text-text-subtle">
                      {bill.counterparty.name}
                    </div>
                  )}
                </td>
                <td className="max-w-[200px] px-3 py-2.5">
                  {bill.account ? (
                    <div className="truncate">
                      <span className="text-2xs font-mono text-text-subtle">
                        {bill.account.code}
                      </span>{" "}
                      <span className="text-xs">{bill.account.name}</span>
                    </div>
                  ) : (
                    <span className="text-text-subtle">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <BillStatusBadge status={status} daysOverdue={bill.days_overdue} />
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">
                  {formatBRL(bill.amount ?? 0)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold">
                  {formatBRL(bill.open_amount ?? 0)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Ações">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {!isPaid && (
                          <DropdownMenuItem onClick={() => onPay(bill)}>
                            <CheckCircle2 className="size-3.5" /> Dar baixa
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onEdit(bill)}>
                          <Pencil className="size-3.5" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDelete(bill)}
                          className="text-expense focus:text-expense"
                        >
                          <Trash2 className="size-3.5" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
