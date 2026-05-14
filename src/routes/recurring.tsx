import * as React from "react";
import { Check, Loader2, MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import {
  useApproveRecurringTemplate,
  useDeleteRecurringTemplate,
  useGenerateRecurringTransactions,
  useRecurringTemplates,
} from "@/features/recurring/hooks";
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
  const approve = useApproveRecurringTemplate();
  const generate = useGenerateRecurringTransactions();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RecurringTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<RecurringTemplate | null>(null);

  const drawerCompanyId = companyId ?? operational[0]?.id ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const pendingManualCount = rows.filter(
    (r) => r.is_active && !r.auto_generate && r.next_run_date <= today,
  ).length;
  const pendingAutoCount = rows.filter(
    (r) => r.is_active && r.auto_generate && r.next_run_date <= today,
  ).length;

  function handleConfirmDelete() {
    if (!confirmDelete) return;
    const t = confirmDelete;
    remove.mutate(t.id, {
      onSuccess: () => {
        toast.success("Recorrência excluída", { description: t.description });
        setConfirmDelete(null);
      },
      onError: (err) => toast.error("Erro", { description: err.message }),
    });
  }

  function handleApprove(t: RecurringTemplate) {
    approve.mutate(t.id, {
      onSuccess: () =>
        toast.success("Lançamento gerado", {
          description: `${t.description} · ${formatDate(t.next_run_date)}`,
        }),
      onError: (err) => toast.error("Erro ao aprovar", { description: err.message }),
    });
  }

  function handleGenerateAll() {
    generate.mutate(undefined, {
      onSuccess: (result) => {
        const total = result.reduce((s, r) => s + r.generated_count, 0);
        toast.success(
          total > 0
            ? `${total} lançamento(s) gerado(s) em ${result.length} template(s)`
            : "Nenhum template auto atrasado",
        );
      },
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
            Aluguel, assinaturas, contas mensais. <strong className="text-text">Auto</strong> →
            rodapé do cron diário gera sozinho. <strong className="text-text">Manual</strong> → você
            aprova cada ocorrência aqui.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingAutoCount > 0 && (
            <Button variant="outline" onClick={handleGenerateAll} disabled={generate.isPending}>
              {generate.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Repeat className="size-4" />
              )}
              Forçar geração auto ({pendingAutoCount})
            </Button>
          )}
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
      </div>

      {pendingManualCount > 0 && (
        <div className="rounded-[var(--radius-md)] border border-warning/30 bg-warning-soft/20 px-3 py-2 text-xs text-text-muted">
          <strong className="text-warning">{pendingManualCount}</strong> recorrência(s) manual(is)
          com ocorrência pendente. Aprove cada uma no menu da linha.
        </div>
      )}

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
              {rows.map((row) => {
                const isOverdue = row.is_active && row.next_run_date <= today;
                return (
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
                    <td
                      className={cn(
                        "px-4 py-3 font-mono text-xs",
                        isOverdue ? "font-semibold text-warning" : "text-text-subtle",
                      )}
                    >
                      {formatDate(row.next_run_date)}
                      {isOverdue && <span className="text-2xs ml-1">⚠</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {row.is_active ? (
                          <Badge tone="income">Ativa</Badge>
                        ) : (
                          <Badge tone="default">Pausada</Badge>
                        )}
                        <Badge tone={row.auto_generate ? "accent" : "info"}>
                          {row.auto_generate ? "Auto" : "Manual"}
                        </Badge>
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
                          {isOverdue && !row.auto_generate && (
                            <DropdownMenuItem
                              onSelect={() => handleApprove(row)}
                              className="text-income focus:bg-income-soft focus:text-income"
                            >
                              <Check className="size-4" /> Aprovar e gerar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(row);
                              setDrawerOpen(true);
                            }}
                          >
                            <Pencil className="size-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setConfirmDelete(row)}
                            className="text-expense focus:bg-expense-soft focus:text-expense"
                          >
                            <Trash2 className="size-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
        title={`Excluir recorrência "${confirmDelete?.description ?? ""}"?`}
        description="O template é apagado, mas lançamentos já gerados a partir dele permanecem."
        confirmLabel="Excluir"
        pending={remove.isPending}
        onConfirm={handleConfirmDelete}
      />

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
