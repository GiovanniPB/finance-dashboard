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

import type { BackfillRun, InvoiceJob, InvoiceJobFilters } from "../api";
import { JOB_STATUS_META } from "../constants";
import {
  useApproveInvoiceJobs,
  useBackfillRuns,
  useConnections,
  useCreateBackfillRun,
  useInvoiceJobs,
} from "../hooks";
import { BackfillRunDrawer } from "./BackfillRunDrawer";
import { InvoiceJobDrawer } from "./InvoiceJobDrawer";

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

const STATUS_TABS = [
  { value: "pending_review", label: "Pendentes" },
  { value: "all", label: "Todas" },
] as const;

export function BackfillPanel() {
  const { user } = useAuth();
  const { data: connections = [] } = useConnections();
  const { data: runs = [] } = useBackfillRuns();
  const createRun = useCreateBackfillRun();
  const approveJobs = useApproveInvoiceJobs();

  const [accountId, setAccountId] = React.useState<string>("");
  const [since, setSince] = React.useState<string>("");
  const [until, setUntil] = React.useState<string>("");
  const [statusTab, setStatusTab] = React.useState<string>("pending_review");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [detail, setDetail] = React.useState<InvoiceJob | null>(null);
  const [loadDetail, setLoadDetail] = React.useState<BackfillRun | null>(null);

  const activeLoad = runs.find((r) => r.status === "running") ?? null;
  const lastLoad = runs.find((r) => r.status === "completed" || r.status === "failed") ?? null;

  const filters = React.useMemo<InvoiceJobFilters>(
    () => ({
      statuses: statusTab === "all" ? null : [statusTab],
      source: "backfill",
    }),
    [statusTab],
  );
  // enquanto há carga rodando, novas notas chegam -> atualiza a tabela sozinha
  const { data: jobs = [], isLoading } = useInvoiceJobs(
    filters,
    activeLoad ? { refetchInterval: 5000 } : undefined,
  );

  const canLoad = accountId && since && until && until >= since && !createRun.isPending;
  const pendingIds = jobs.filter((j) => j.status === "pending_review").map((j) => j.id);
  const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pendingIds));
  }

  async function load() {
    const conn = connections.find((c) => c.id === accountId);
    if (!conn) return;
    try {
      await createRun.mutateAsync({
        accountId,
        organizationId: conn.organization_id,
        createdSince: toIso(since, false),
        createdUntil: toIso(until, true),
        dryRun: false,
        createdBy: user?.id ?? "",
      });
      toast.success("Carga iniciada — as notas aparecem na lista conforme são carregadas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar a carga.");
    }
  }

  function emitSelected() {
    const ids = [...selected];
    approveJobs.mutate(
      { ids, userId: user?.id ?? "" },
      {
        onSuccess: (n) => {
          toast.success(`${n} nota(s) enviadas para a fila de emissão.`);
          setSelected(new Set());
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao emitir."),
      },
    );
  }

  return (
    <div className="space-y-5">
      {/* Carregar período */}
      <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Carregar período</h2>
        <p className="mt-1 text-xs text-text-muted">
          Carrega as cobranças pagas da janela como notas <strong>pendentes</strong> (dedup
          automática — o que já existe, inclusive via webhook, é ignorado). Nada é emitido até você
          selecionar e emitir.
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
          <Button type="button" disabled={!canLoad} onClick={() => void load()}>
            Carregar
          </Button>
        </div>
      </div>

      {/* Status da carga */}
      {activeLoad ? (
        <button
          type="button"
          onClick={() => setLoadDetail(activeLoad)}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3 text-left"
        >
          <Badge tone="info">Carregando</Badge>
          <div className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${runProgress(activeLoad) ?? 5}%` }}
              />
            </div>
          </div>
          <span className="text-2xs text-text-muted">
            {activeLoad.charges_seen}
            {activeLoad.total_charges != null ? `/${activeLoad.total_charges}` : ""} ·{" "}
            {runProgress(activeLoad) ?? 0}%
          </span>
        </button>
      ) : lastLoad ? (
        <button
          type="button"
          onClick={() => setLoadDetail(lastLoad)}
          className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface p-3 text-left"
        >
          <span className="text-xs text-text-muted">
            Última carga: <strong className="text-text">{lastLoad.jobs_created}</strong> novas ·{" "}
            {lastLoad.jobs_skipped} ignoradas
            {lastLoad.last_error ? " · com erro" : ""}
          </span>
          <span className="text-2xs text-accent">ver detalhes →</span>
        </button>
      ) : null}

      {/* Tabela de notas retroativas */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-[var(--radius-md)] border border-border bg-surface-2 p-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setStatusTab(t.value)}
                className={
                  statusTab === t.value
                    ? "rounded-[var(--radius-sm)] bg-surface px-3 py-1 text-xs font-medium shadow-sm"
                    : "rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium text-text-muted"
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0 || approveJobs.isPending}
            onClick={emitSelected}
          >
            Emitir selecionadas ({selected.size})
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : jobs.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
            Nenhuma nota retroativa carregada. Carregue um período acima.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Selecionar todas"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left">Empresa</th>
                  <th className="px-3 py-2.5 text-left">Tomador</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-3 py-2.5 text-left">Criada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map((job) => {
                  const status = JOB_STATUS_META[job.status] ?? {
                    label: job.status,
                    tone: "default" as const,
                  };
                  const selectable = job.status === "pending_review";
                  return (
                    <tr key={job.id} className="hover:bg-surface-2/60">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          disabled={!selectable}
                          checked={selected.has(job.id)}
                          onChange={() => toggle(job.id)}
                          aria-label="Selecionar nota"
                        />
                      </td>
                      <td className="cursor-pointer px-3 py-2.5" onClick={() => setDetail(job)}>
                        {job.company?.trade_name ?? job.company?.legal_name ?? "—"}
                      </td>
                      <td className="cursor-pointer px-3 py-2.5" onClick={() => setDetail(job)}>
                        <div className="truncate">{job.tomador_nome ?? "—"}</div>
                        <div className="text-2xs font-mono text-text-subtle">
                          {job.tomador_documento ?? ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {formatBRL(job.valor_servicos)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-text-muted">
                        {formatDate(job.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InvoiceJobDrawer
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        job={detail}
      />
      <BackfillRunDrawer
        open={Boolean(loadDetail)}
        onOpenChange={(o) => !o && setLoadDetail(null)}
        run={loadDetail}
      />
    </div>
  );
}
