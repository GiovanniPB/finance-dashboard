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
import { formatBRL } from "@/lib/format";

import type { BackfillPreview, BackfillRun } from "../api";
import type { BadgeTone } from "../constants";
import { useBackfillRuns, useConnections, useCreateBackfillRun } from "../hooks";
import { BackfillRunDrawer } from "./BackfillRunDrawer";

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

/** ISO -> dd/mm/aaaa estável (sem deslocamento de fuso; usa só a parte da data). */
export function fmtWindow(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** % de progresso (charges_seen / total_charges); null se o total ainda não é conhecido. */
export function runProgress(run: BackfillRun): number | null {
  if (!run.total_charges || run.total_charges <= 0) return null;
  return Math.min(100, Math.round((run.charges_seen / run.total_charges) * 100));
}

export function BackfillPanel() {
  const { user } = useAuth();
  const { data: connections = [] } = useConnections();
  const { data: runs = [], isLoading } = useBackfillRuns();
  const createRun = useCreateBackfillRun();

  const [accountId, setAccountId] = React.useState<string>("");
  const [since, setSince] = React.useState<string>("");
  const [until, setUntil] = React.useState<string>("");
  const [selected, setSelected] = React.useState<BackfillRun | null>(null);

  const canSubmit = accountId && since && until && until >= since && !createRun.isPending;

  // recebe ISO já normalizado (o form converte data->ISO; "emitir de verdade" reusa o ISO do run)
  async function createRunFor(
    dryRun: boolean,
    account: string,
    sinceIso: string,
    untilIso: string,
  ) {
    const conn = connections.find((c) => c.id === account);
    if (!conn) {
      toast.error("Selecione uma conexão pagar.me.");
      return;
    }
    try {
      await createRun.mutateAsync({
        accountId: account,
        organizationId: conn.organization_id,
        createdSince: sinceIso,
        createdUntil: untilIso,
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
            onClick={() =>
              void createRunFor(true, accountId, toIso(since, false), toIso(until, true))
            }
          >
            Simular emissão
          </Button>
        </div>
      </div>

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
              onOpen={() => setSelected(run)}
              onEmit={() =>
                void createRunFor(
                  false,
                  run.pagarme_account_id,
                  run.created_since,
                  run.created_until,
                )
              }
              busy={createRun.isPending}
            />
          ))}
        </div>
      )}

      <BackfillRunDrawer
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        run={selected}
      />
    </div>
  );
}

interface RunCardProps {
  run: BackfillRun;
  onOpen: () => void;
  onEmit: () => void;
  busy: boolean;
}

function RunCard({ run, onOpen, onEmit, busy }: RunCardProps) {
  const status = STATUS_META[run.status] ?? { label: run.status, tone: "default" as const };
  const preview = run.preview as BackfillPreview | null;
  const isDry = run.dry_run;
  const isCompleted = run.status === "completed";
  const pct = runProgress(run);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[var(--radius-md)] border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-2/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={isDry ? "default" : "accent"}>{isDry ? "Simulação" : "Emissão"}</Badge>
          <span className="text-sm font-medium">{run.account?.label ?? "—"}</span>
          <span className="text-xs text-text-muted">
            {fmtWindow(run.created_since)} – {fmtWindow(run.created_until)}
          </span>
        </div>
        <span className="text-2xs text-accent">Ver detalhes →</span>
      </div>

      {/* progresso */}
      <div className="mt-3">
        <div className="text-2xs flex items-center justify-between text-text-subtle">
          <span>
            {run.charges_seen}
            {run.total_charges != null ? ` / ${run.total_charges}` : ""} cobranças
          </span>
          {pct != null && <span>{pct}%</span>}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${pct ?? (run.status === "running" ? 5 : 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat
          label={isDry ? "Notas previstas" : "Notas criadas"}
          value={String(isDry ? (preview?.totalJobs ?? 0) : run.jobs_created)}
        />
        <Stat label="Valor total" value={formatBRL(preview?.totalReais ?? 0)} />
        <Stat label="Ignoradas" value={String(run.jobs_skipped)} muted={run.jobs_skipped === 0} />
        <Stat
          label="Endereço incompleto"
          value={String(preview?.incompleteAddress ?? 0)}
          muted={!preview?.incompleteAddress}
        />
      </div>

      {run.last_error && <p className="mt-2 text-xs text-expense">{run.last_error}</p>}

      {isCompleted && isDry && (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onEmit();
            }}
          >
            Emitir de verdade
          </Button>
        </div>
      )}
    </button>
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
