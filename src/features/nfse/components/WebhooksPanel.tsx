import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";

import type { WebhookEvent, WebhookFilters, WebhookProvider } from "../api";
import { useWebhookEvents } from "../hooks";
import { WebhookEventDrawer } from "./WebhookEventDrawer";

const PROVIDERS: { value: WebhookProvider; label: string }[] = [
  { value: "pagarme", label: "pagar.me" },
  { value: "focus", label: "Focus" },
];

export function WebhooksPanel() {
  const [provider, setProvider] = React.useState<WebhookProvider>("pagarme");
  const [onlyErrors, setOnlyErrors] = React.useState(false);
  const [onlyUnprocessed, setOnlyUnprocessed] = React.useState(false);
  const [selected, setSelected] = React.useState<WebhookEvent | null>(null);

  const filters: WebhookFilters = { provider, onlyErrors, onlyUnprocessed };
  const { data: events = [], isLoading, isError } = useWebhookEvents(filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-[var(--radius-md)] border border-border bg-surface-2 p-1">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setProvider(p.value)}
              className={cn(
                "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors",
                provider === p.value
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <FilterChip
          active={onlyErrors}
          onClick={() => setOnlyErrors((v) => !v)}
          label="Só com erro"
        />
        <FilterChip
          active={onlyUnprocessed}
          onClick={() => setOnlyUnprocessed((v) => !v)}
          label="Não processados"
        />
        <span className="text-xs text-text-muted">{events.length} evento(s)</span>
      </div>

      {isError ? (
        <div className="rounded-[var(--radius-md)] border border-warning bg-warning-soft p-4 text-sm text-warning">
          Sem permissão para ver o log de webhooks (restrito a administradores).
        </div>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : events.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhum webhook recebido neste filtro.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                <th className="px-3 py-2.5 text-left">Recebido</th>
                <th className="px-3 py-2.5 text-left">Tipo / status</th>
                <th className="px-3 py-2.5 text-left">Referência</th>
                <th className="px-3 py-2.5 text-left">Processamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((ev) => (
                <tr
                  key={ev.id}
                  className="cursor-pointer hover:bg-surface-2/60"
                  onClick={() => setSelected(ev)}
                >
                  <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-text-muted">
                    {formatDate(ev.receivedAt)}
                  </td>
                  <td className="px-3 py-2.5">{ev.kind}</td>
                  <td className="text-2xs px-3 py-2.5 font-mono text-text-subtle">
                    <span className="block max-w-[18rem] truncate">{ev.ref}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {ev.processError ? (
                      <Badge tone="expense">erro</Badge>
                    ) : ev.processedAt ? (
                      <Badge tone="income">processado</Badge>
                    ) : (
                      <Badge tone="warning">pendente</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WebhookEventDrawer
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        event={selected}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-border text-text-muted hover:bg-surface-2",
      )}
    >
      {label}
    </button>
  );
}
