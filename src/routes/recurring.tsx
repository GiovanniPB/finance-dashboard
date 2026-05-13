import * as React from "react";
import { MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import type { RecurringTemplate } from "@/features/recurring/api";
import { RecurringDrawer } from "@/features/recurring/components/RecurringDrawer";
import { useDeleteRecurringTemplate, useRecurringTemplates } from "@/features/recurring/hooks";
import { RECURRENCE_FREQUENCIES } from "@/features/recurring/schema";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

const FREQ_LABELS = Object.fromEntries(RECURRENCE_FREQUENCIES.map((f) => [f.value, f.label]));

export default function RecurringPage() {
  const { selectedCompanyId, isConsolidated, companies } = useCompanyScope();
  const operational = companies.filter((c) => !c.is_holding);
  const companyId = isConsolidated ? null : selectedCompanyId;

  const { data: rows = [], isLoading } = useRecurringTemplates(companyId);
  const remove = useDeleteRecurringTemplate();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RecurringTemplate | null>(null);

  const drawerCompanyId = companyId ?? operational[0]?.id ?? null;

  function handleDelete(t: RecurringTemplate) {
    remove.mutate(t.id, {
      onSuccess: () => toast.success("Recorrência excluída", { description: t.description }),
      onError: (err) => toast.error("Erro", { description: err.message }),
    });
  }

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            <Repeat className="size-3 text-accent" />
            Recorrências
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            Templates de lançamentos recorrentes
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Aluguel, assinaturas, contas mensais — defina uma vez e o sistema gera os lançamentos
            automaticamente.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
          disabled={!drawerCompanyId}
        >
          <Plus className="size-4" /> Nova recorrência
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma recorrência cadastrada.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60">
              <tr className="border-b border-border">
                <Th>Descrição</Th>
                <Th>Conta</Th>
                <Th>Frequência</Th>
                <Th align="right">Valor</Th>
                <Th>Próxima execução</Th>
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
                  <td className="px-4 py-3 font-medium">{row.description}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {row.account ? `${row.account.code} · ${row.account.name}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {FREQ_LABELS[row.frequency]}
                    {row.day_of_month && (
                      <span className="text-2xs ml-1 text-text-subtle">
                        (dia {row.day_of_month})
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono font-medium tabular-nums",
                      row.direction === "inflow" ? "text-income" : "text-expense",
                    )}
                  >
                    {row.direction === "inflow" ? "+" : "-"} {formatBRL(row.amount)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-subtle">
                    {formatDate(row.next_run_date)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {row.is_active ? (
                        <Badge tone="income">Ativa</Badge>
                      ) : (
                        <Badge tone="default">Pausada</Badge>
                      )}
                      {row.auto_generate && <Badge tone="accent">Auto</Badge>}
                    </div>
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
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(row);
                            setDrawerOpen(true);
                          }}
                        >
                          <Pencil className="size-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleDelete(row)}
                          className="text-expense"
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
      )}

      {drawerCompanyId && (
        <RecurringDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          template={editing}
          companyId={drawerCompanyId}
        />
      )}
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
