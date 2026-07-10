import * as React from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

import { fetchAllInvoiceJobs, type InvoiceJob, type InvoiceJobFilters } from "../api";
import {
  AMBIENTE_FILTER_OPTIONS,
  AMBIENTE_META,
  JOB_STATUS_FILTERS,
  JOB_STATUS_META,
  ORIGIN_FILTER_OPTIONS,
} from "../constants";
import { exportInvoiceJobs, type ExportFormat } from "../export";
import { useApproveInvoiceJobs, useConnections, useInvoiceJobs } from "../hooks";
import { useJobSelection } from "../useJobSelection";
import { InvoiceJobDrawer } from "./InvoiceJobDrawer";

const PAGE_SIZE = 20;

/** Origem da nota: retroativa (backfill) vs. tempo real (webhook do charge.paid). */
function jobOrigin(job: InvoiceJob): { label: string; tone: "accent" | "default" } {
  const source = (job.metadata as { source?: string } | null)?.source;
  return source === "backfill"
    ? { label: "Retroativa", tone: "accent" }
    : { label: "Webhook", tone: "default" };
}

export function InvoiceJobsPanel() {
  const { user } = useAuth();
  const { data: connections = [] } = useConnections();
  const approveJobs = useApproveInvoiceJobs();

  const [statusFilter, setStatusFilter] = React.useState<string>("review");
  const [accountId, setAccountId] = React.useState<string>("all");
  const [ambiente, setAmbiente] = React.useState<string>("all");
  const [origin, setOrigin] = React.useState<string>("all");
  const [page, setPage] = React.useState(0);
  const [detail, setDetail] = React.useState<InvoiceJob | null>(null);
  const [exporting, setExporting] = React.useState<ExportFormat | null>(null);

  const filters = React.useMemo<InvoiceJobFilters>(() => {
    const group = JOB_STATUS_FILTERS.find((f) => f.value === statusFilter);
    return {
      statuses: group?.statuses ?? null,
      accountId: accountId === "all" ? null : accountId,
      ambiente: ambiente === "all" ? null : ambiente,
      origin: origin === "all" ? null : origin,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [statusFilter, accountId, ambiente, origin, page]);

  const { data, isLoading } = useInvoiceJobs(filters);
  const jobs = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { selected, toggle, toggleAll, headerChecked, pendingIds, clear } = useJobSelection(jobs);

  // qualquer filtro muda -> volta à primeira página e zera a seleção
  React.useEffect(() => {
    setPage(0);
    clear();
  }, [statusFilter, accountId, ambiente, origin, clear]);

  function emitSelected() {
    approveJobs.mutate(
      { ids: [...selected], userId: user?.id ?? "" },
      {
        onSuccess: (n) => {
          toast.success(`${n} nota(s) enviadas para a fila de emissão.`);
          clear();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao emitir."),
      },
    );
  }

  // exporta TODAS as notas do filtro atual (não só a página) para a contabilidade
  async function handleExport(format: ExportFormat) {
    setExporting(format);
    try {
      const rows = await fetchAllInvoiceJobs(filters);
      if (rows.length === 0) {
        toast.info("Nenhuma nota neste filtro para exportar.");
        return;
      }
      await exportInvoiceJobs(rows, format);
      toast.success(`${rows.length} nota(s) exportadas.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar.");
    } finally {
      setExporting(null);
    }
  }

  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRow = Math.min(total, page * PAGE_SIZE + jobs.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ambiente} onValueChange={setAmbiente}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AMBIENTE_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORIGIN_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Conexão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as conexões</SelectItem>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={exporting !== null}>
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void handleExport("xlsx")}>
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleExport("csv")}>
                CSV (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            size="sm"
            disabled={selected.size === 0 || approveJobs.isPending}
            onClick={emitSelected}
          >
            Emitir selecionadas ({selected.size})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : jobs.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma nota neste filtro.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={headerChecked}
                    onCheckedChange={toggleAll}
                    disabled={pendingIds.length === 0}
                    aria-label="Selecionar todas as pendentes desta página"
                  />
                </th>
                <th className="px-3 py-2.5 text-left">Criada</th>
                <th className="px-3 py-2.5 text-left">Empresa</th>
                <th className="px-3 py-2.5 text-left">Origem</th>
                <th className="px-3 py-2.5 text-left">Conexão</th>
                <th className="px-3 py-2.5 text-left">Tomador</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5 text-left">Ambiente</th>
                <th className="px-3 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => {
                const status = JOB_STATUS_META[job.status] ?? {
                  label: job.status,
                  tone: "default" as const,
                };
                const origem = jobOrigin(job);
                const amb = AMBIENTE_META[job.ambiente] ?? {
                  label: job.ambiente,
                  tone: "default" as const,
                };
                const selectable = job.status === "pending_review";
                return (
                  <tr
                    key={job.id}
                    className="cursor-pointer hover:bg-surface-2/60"
                    onClick={() => setDetail(job)}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(job.id)}
                        disabled={!selectable}
                        onCheckedChange={() => toggle(job.id)}
                        aria-label="Selecionar nota"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-text-muted">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      {job.company?.trade_name ?? job.company?.legal_name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={origem.tone}>{origem.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">{job.account?.label ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="truncate">{job.tomador_nome ?? "—"}</div>
                      <div className="text-2xs font-mono text-text-subtle">
                        {job.tomador_documento ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {formatBRL(job.valor_servicos)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={amb.tone}>{amb.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-2xs text-text-muted">
            {firstRow}–{lastRow} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            <span className="text-2xs text-text-muted">
              {page + 1}/{pageCount}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Próxima <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <InvoiceJobDrawer
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        job={detail}
      />
    </div>
  );
}
