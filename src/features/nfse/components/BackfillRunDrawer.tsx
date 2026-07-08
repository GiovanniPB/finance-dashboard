import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatBRL } from "@/lib/format";

import {
  SKIP_REASON_LABELS,
  type BackfillDiagnostics,
  type BackfillPreview,
  type BackfillRun,
} from "../api";
import { useCancelBackfillRun } from "../hooks";
import { fmtWindow, runProgress } from "./BackfillPanel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: BackfillRun | null;
}

const STATUS_LABEL: Record<string, string> = {
  running: "carregando",
  completed: "concluída",
  failed: "falhou",
  cancelled: "cancelada",
};

/** Detalhes de uma CARGA (invoice_backfill_runs) — diagnóstico do que aconteceu. */
export function BackfillRunDrawer({ open, onOpenChange, run }: Props) {
  const cancelRun = useCancelBackfillRun();

  if (!run) return null;

  const preview = run.preview as BackfillPreview | null;
  const diag = run.diagnostics as BackfillDiagnostics | null;
  const pct = runProgress(run);
  const isRunning = run.status === "running";
  const skipReasons = Object.entries(diag?.skipReasons ?? {}).sort((a, b) => b[1] - a[1]);
  const unmapped = Object.entries(diag?.unmappedRecipients ?? {}).sort((a, b) => b[1] - a[1]);
  const byCompany = Object.entries(preview?.byCompany ?? {});
  const pageErrors = diag?.pageErrors ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Carga · {run.account?.label ?? "—"}</SheetTitle>
          <SheetDescription>
            {fmtWindow(run.created_since)} – {fmtWindow(run.created_until)} ·{" "}
            {STATUS_LABEL[run.status] ?? run.status}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <section>
            <div className="text-2xs flex items-center justify-between text-text-subtle">
              <span>
                {run.charges_seen}
                {run.total_charges != null ? ` / ${run.total_charges}` : ""} cobranças vistas
              </span>
              {pct != null && <span>{pct}%</span>}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${pct ?? (isRunning ? 5 : 100)}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Metric label="Notas novas" value={String(run.jobs_created)} />
              <Metric label="Já existiam" value={String(diag?.duplicates ?? 0)} />
              <Metric label="Ignoradas" value={String(run.jobs_skipped)} />
              <Metric label="Valor" value={formatBRL(preview?.totalReais ?? 0)} />
            </div>
          </section>

          {skipReasons.length > 0 && (
            <section>
              <h3 className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                Motivos das ignoradas
              </h3>
              <div className="mt-2 space-y-1">
                {skipReasons.map(([reason, n]) => (
                  <div key={reason} className="flex items-center justify-between text-sm">
                    <span>{SKIP_REASON_LABELS[reason] ?? reason}</span>
                    <span className="font-mono text-text-muted">{n}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {unmapped.length > 0 && (
            <section className="rounded-[var(--radius-sm)] border border-warning/40 bg-warning-soft/40 p-3">
              <h3 className="text-2xs font-medium tracking-wide text-warning uppercase">
                Recebedores não mapeados ({unmapped.length})
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Estes <code>re_</code> apareceram no split mas não estão vinculados a uma empresa.
                Mapeie-os na aba <strong>Conexões pagar.me → recebedores</strong> e carregue de
                novo.
              </p>
              <div className="mt-2 space-y-1">
                {unmapped.map(([re, n]) => (
                  <div key={re} className="text-2xs flex items-center justify-between font-mono">
                    <span className="truncate">{re}</span>
                    <span className="text-text-muted">{n}×</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {byCompany.length > 0 && (
            <section>
              <h3 className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                Notas por empresa
              </h3>
              <div className="mt-2 space-y-1">
                {byCompany.map(([company, tally]) => (
                  <div key={company} className="flex items-center justify-between text-sm">
                    <span className="text-2xs truncate font-mono text-text-muted">{company}</span>
                    <span className="font-mono">
                      {tally.count} · {formatBRL(tally.reais)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {run.last_error && <p className="text-xs text-expense">{run.last_error}</p>}
          {pageErrors.length > 0 && (
            <section>
              <h3 className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                Erros
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-expense">
                {pageErrors.map((err, i) => (
                  <li key={i} className="font-mono">
                    {err}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </SheetBody>

        <SheetFooter>
          {isRunning && (
            <Button
              type="button"
              variant="ghost"
              disabled={cancelRun.isPending}
              onClick={() =>
                cancelRun.mutate(run.id, { onSuccess: () => toast.success("Carga cancelada.") })
              }
            >
              Cancelar carga
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs tracking-wide text-text-subtle uppercase">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
