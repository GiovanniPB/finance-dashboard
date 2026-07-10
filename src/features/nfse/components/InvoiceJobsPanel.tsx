import * as React from "react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { InvoiceJob, InvoiceJobFilters } from "../api";
import { JOB_STATUS_FILTERS, JOB_STATUS_META } from "../constants";
import { useConnections, useInvoiceJobs } from "../hooks";
import { InvoiceJobDrawer } from "./InvoiceJobDrawer";

/** Origem da nota: retroativa (backfill) vs. tempo real (webhook do charge.paid). */
function jobOrigin(job: InvoiceJob): { label: string; tone: "accent" | "default" } {
  const source = (job.metadata as { source?: string } | null)?.source;
  return source === "backfill"
    ? { label: "Retroativa", tone: "accent" }
    : { label: "Webhook", tone: "default" };
}

export function InvoiceJobsPanel() {
  const [statusFilter, setStatusFilter] = React.useState<string>("review");
  const [accountId, setAccountId] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<InvoiceJob | null>(null);

  const { data: connections = [] } = useConnections();

  const filters = React.useMemo<InvoiceJobFilters>(() => {
    const group = JOB_STATUS_FILTERS.find((f) => f.value === statusFilter);
    return {
      statuses: group?.statuses ?? null,
      accountId: accountId === "all" ? null : accountId,
    };
  }, [statusFilter, accountId]);

  const { data, isLoading } = useInvoiceJobs(filters);
  const jobs = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52">
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

        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-52">
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

        <span className="text-xs text-text-muted">{total} nota(s)</span>
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
                <th className="px-3 py-2.5 text-left">Criada</th>
                <th className="px-3 py-2.5 text-left">Empresa</th>
                <th className="px-3 py-2.5 text-left">Origem</th>
                <th className="px-3 py-2.5 text-left">Conexão</th>
                <th className="px-3 py-2.5 text-left">Tomador</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => {
                const status = JOB_STATUS_META[job.status] ?? {
                  label: job.status,
                  tone: "default" as const,
                };
                return (
                  <tr
                    key={job.id}
                    className="cursor-pointer hover:bg-surface-2/60"
                    onClick={() => setSelected(job)}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-text-muted">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      {job.company?.trade_name ?? job.company?.legal_name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const origin = jobOrigin(job);
                        return <Badge tone={origin.tone}>{origin.label}</Badge>;
                      })()}
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
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <InvoiceJobDrawer
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        job={selected}
      />
    </div>
  );
}
