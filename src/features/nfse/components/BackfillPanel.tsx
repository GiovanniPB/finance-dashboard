import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { BackfillPreview, BackfillRun } from "../api";
import type { BadgeTone } from "../constants";
import {
  useBackfillRuns,
  useBulkApproveBackfillRun,
  useCancelBackfillRun,
  useConnections,
  useCreateBackfillRun,
} from "../hooks";

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  running: { label: "Processando", tone: "info" },
  completed: { label: "Concluído", tone: "income" },
  failed: { label: "Falhou", tone: "expense" },
  cancelled: { label: "Cancelado", tone: "default" },
};

/** date (YYYY-MM-DD) do input -> ISO UTC (início/fim do dia). */
function toIso(date: string, endOfDay: boolean): string {
  return `${date}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
}

export function BackfillPanel() {
  const { user } = useAuth();
  const { data: connections = [] } = useConnections();
  const { data: runs = [], isLoading } = useBackfillRuns();

  const createRun = useCreateBackfillRun();
  const cancelRun = useCancelBackfillRun();
  const bulkApprove = useBulkApproveBackfillRun();

  const [accountId, setAccountId] = React.useState<string>("");
  const [since, setSince] = React.useState<string>("");
  const [until, setUntil] = React.useState<string>("");

  const canSubmit = accountId && since && until && until >= since && !createRun.isPending;

  async function start(dryRun: boolean, account: string, from: string, to: string) {
    const conn = connections.find((c) => c.id === account);
    if (!conn) {
      toast.error("Selecione uma conexão pagar.me.");
      return;
    }
    try {
      await createRun.mutateAsync({
        accountId: account,
        organizationId: conn.organization_id,
        createdSince: toIso(from, false),
        createdUntil: toIso(to, true),
        dryRun,
        createdBy: user?.id ?? "",
      });
      toast.success(
        dryRun
          ? "Simulação iniciada — o preview aparece em instantes."
          : "Emissão iniciada — as notas nascem em revisão para aprovação.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar o lote.");
    }
  }

  return (
    <div className="space-y-5">
      {/* Formulário: sempre começa por uma SIMULAÇÃO (dry-run) */}
      <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Nova emissão retroativa</h2>
        <p className="mt-1 text-xs text-text-muted">
          Simule primeiro para revisar quantas notas seriam criadas na janela. Notas retroativas
          saem com data de hoje (competência atual) e nascem em <strong>revisão</strong>.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Conexão pagar.me</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="bf-since">De</Label>
            <Input
              id="bf-since"
              type="date"
              className="mt-1"
              value={since}
              max={until || undefined}
              onChange={(e) => setSince(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="bf-until">Até</Label>
            <Input
              id="bf-until"
              type="date"
              className="mt-1"
              value={until}
              min={since || undefined}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void start(true, accountId, since, until)}
          >
            Simular emissão
          </Button>
        </div>
      </div>

      {/* Lista de lotes */}
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : runs.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhum lote ainda. Simule uma emissão acima.
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              onEmit={() =>
                void start(false, run.pagarme_account_id, run.created_since, run.created_until)
              }
              onCancel={() => {
                cancelRun.mutate(run.id, {
                  onSuccess: () => toast.success("Lote cancelado."),
                });
              }}
              onApprove={() => {
                bulkApprove.mutate(
                  { runId: run.id, userId: user?.id ?? "" },
                  {
                    onSuccess: (n) =>
                      toast.success(
                        n > 0 ? `${n} nota(s) enviadas para a fila.` : "Nenhuma nota pendente.",
                      ),
                    onError: (e) =>
                      toast.error(e instanceof Error ? e.message : "Falha ao aprovar."),
                  },
                );
              }}
              busy={bulkApprove.isPending || cancelRun.isPending || createRun.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RunCardProps {
  run: BackfillRun;
  onEmit: () => void;
  onCancel: () => void;
  onApprove: () => void;
  busy: boolean;
}

function RunCard({ run, onEmit, onCancel, onApprove, busy }: RunCardProps) {
  const status = STATUS_META[run.status] ?? { label: run.status, tone: "default" as const };
  const preview = run.preview as BackfillPreview | null;
  const isDry = run.dry_run;
  const isCompleted = run.status === "completed";
  const isRunning = run.status === "running";

  // run.created_since/until já vêm normalizados; a janela é o mesmo par para simular/emitir
  const window = `${formatDate(run.created_since)} – ${formatDate(run.created_until)}`;

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={isDry ? "default" : "accent"}>{isDry ? "Simulação" : "Emissão"}</Badge>
          <span className="text-sm font-medium">{run.account?.label ?? "—"}</span>
          <span className="text-xs text-text-muted">{window}</span>
        </div>
        <span className="text-2xs font-mono text-text-subtle">{formatDate(run.created_at)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Cobranças vistas" value={String(run.charges_seen)} />
        <Stat
          label={isDry ? "Notas previstas" : "Notas criadas"}
          value={String(isDry ? (preview?.totalJobs ?? 0) : run.jobs_created)}
        />
        <Stat label="Valor total" value={formatBRL(preview?.totalReais ?? 0)} />
        <Stat
          label="Endereço incompleto"
          value={String(preview?.incompleteAddress ?? 0)}
          muted={!preview?.incompleteAddress}
        />
      </div>

      {run.last_error && <p className="mt-2 text-xs text-expense">{run.last_error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {isCompleted && isDry && (
          <Button type="button" size="sm" disabled={busy} onClick={onEmit}>
            Emitir de verdade
          </Button>
        )}
        {isCompleted && !isDry && (
          <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
            Aprovar notas do lote
          </Button>
        )}
        {isRunning && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-2xs tracking-wide text-text-subtle uppercase">{label}</div>
      <div className={muted ? "font-mono text-text-muted" : "font-mono"}>{value}</div>
    </div>
  );
}
