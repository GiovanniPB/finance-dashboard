import * as React from "react";
import { Ban, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/dates";

import type { BackfillRun } from "../api";
import { fmtWindow, runProgress } from "../backfill-format";
import type { BadgeTone } from "../constants";
import { useCancelBackfillRun, useDeleteBackfillRun } from "../hooks";

interface Props {
  runs: BackfillRun[];
  onOpenDetail: (run: BackfillRun) => void;
}

const RUN_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  running: { label: "Carregando", tone: "info" },
  completed: { label: "Concluída", tone: "income" },
  failed: { label: "Falhou", tone: "expense" },
  cancelled: { label: "Cancelada", tone: "default" },
};

/** Histórico de TODAS as cargas retroativas (não só a última). */
export function BackfillRunsList({ runs, onOpenDetail }: Props) {
  const cancelRun = useCancelBackfillRun();
  const deleteRun = useDeleteBackfillRun();
  const [toDelete, setToDelete] = React.useState<BackfillRun | null>(null);

  function confirmDelete() {
    if (!toDelete) return;
    const run = toDelete;
    deleteRun.mutate(run.id, {
      onSuccess: (removed) => {
        toast.success(
          removed > 0
            ? `Carga excluída · ${removed} nota(s) pendente(s) removida(s).`
            : "Carga excluída.",
        );
        setToDelete(null);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir a carga."),
    });
  }

  if (runs.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Histórico de cargas</h2>

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
              <th className="px-3 py-2.5 text-left">Conexão</th>
              <th className="px-3 py-2.5 text-left">Janela</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-left">Resultado</th>
              <th className="px-3 py-2.5 text-left">Criada</th>
              <th className="w-24 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((run) => {
              const meta = RUN_STATUS_META[run.status] ?? {
                label: run.status,
                tone: "default" as const,
              };
              const pct = runProgress(run);
              const isRunning = run.status === "running";
              return (
                <tr
                  key={run.id}
                  className="cursor-pointer hover:bg-surface-2/60"
                  onClick={() => onOpenDetail(run)}
                >
                  <td className="px-3 py-2.5">{run.account?.label ?? "—"}</td>
                  <td className="text-2xs px-3 py-2.5 font-mono whitespace-nowrap text-text-muted">
                    {fmtWindow(run.created_since)} – {fmtWindow(run.created_until)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    {isRunning ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-500"
                            style={{ width: `${pct ?? 5}%` }}
                          />
                        </div>
                        <span className="text-2xs text-text-muted">
                          {run.charges_seen}
                          {run.total_charges != null ? `/${run.total_charges}` : ""}
                        </span>
                      </div>
                    ) : (
                      <span className="text-2xs text-text-muted">
                        <strong className="text-text">{run.jobs_created}</strong> novas ·{" "}
                        {run.jobs_skipped} ignoradas
                        {run.last_error ? " · com erro" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-text-muted">
                    {formatDate(run.created_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isRunning && (
                        <button
                          type="button"
                          title="Cancelar carga"
                          disabled={cancelRun.isPending}
                          onClick={() =>
                            cancelRun.mutate(run.id, {
                              onSuccess: () => toast.success("Carga cancelada."),
                            })
                          }
                          className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-subtle hover:bg-surface-2 hover:text-text"
                        >
                          <Ban className="size-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Excluir carga"
                        onClick={() => setToDelete(run)}
                        className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-subtle hover:bg-expense-soft hover:text-expense"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir carga?"
        description={
          <>
            Remove o registro desta carga e as notas dela que ainda estão em{" "}
            <strong>revisão</strong> (não emitidas). Notas já enviadas para emissão são preservadas.
            Útil para re-testar a mesma janela.
          </>
        }
        confirmLabel={deleteRun.isPending ? "Excluindo…" : "Excluir"}
        pending={deleteRun.isPending}
        onConfirm={confirmDelete}
      />

      {deleteRun.isPending && (
        <p className="text-2xs flex items-center gap-1 text-text-subtle">
          <Loader2 className="size-3 animate-spin" /> processando exclusão…
        </p>
      )}
    </section>
  );
}
