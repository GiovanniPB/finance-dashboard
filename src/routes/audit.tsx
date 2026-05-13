import * as React from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";

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
import { useAuditLog } from "@/features/audit/hooks";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";

const ACTION_META: Record<string, { label: string; tone: "income" | "info" | "expense" }> = {
  insert: { label: "Criado", tone: "income" },
  update: { label: "Atualizado", tone: "info" },
  delete: { label: "Excluído", tone: "expense" },
};

const TABLES = [
  { value: "transactions", label: "Lançamentos" },
  { value: "employees", label: "Colaboradores" },
  { value: "payroll_items", label: "Itens de folha" },
] as const;

export default function AuditPage() {
  const [filters, setFilters] = useQueryStates({
    table: parseAsString.withDefault(""),
    from: parseAsString.withDefault(""),
    to: parseAsString.withDefault(""),
    page: parseAsInteger.withDefault(1),
  });

  const { data, isLoading } = useAuditLog({
    table: filters.table || null,
    from: filters.from ? `${filters.from}T00:00:00` : null,
    to: filters.to ? `${filters.to}T23:59:59` : null,
    page: filters.page,
    pageSize: 50,
  });

  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            <History className="size-3 text-accent" />
            Auditoria
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            Histórico de alterações
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Todas as criações, edições e exclusões em lançamentos, colaboradores e folha.
          </p>
        </div>
        {data && <Badge tone="info">{data.total.toLocaleString("pt-BR")} eventos</Badge>}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="table">Tabela</Label>
          <Select
            value={filters.table || "__all__"}
            onValueChange={(v) => void setFilters({ table: v === "__all__" ? "" : v, page: 1 })}
          >
            <SelectTrigger id="table" className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {TABLES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">De</Label>
          <Input
            id="from"
            type="date"
            value={filters.from}
            onChange={(e) => void setFilters({ from: e.target.value, page: 1 })}
            className="w-[150px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Até</Label>
          <Input
            id="to"
            type="date"
            value={filters.to}
            onChange={(e) => void setFilters({ to: e.target.value, page: 1 })}
            className="w-[150px]"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhum evento de auditoria encontrado para os filtros.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <ul>
            {data.rows.map((entry) => {
              const meta = ACTION_META[entry.action] ?? {
                label: entry.action,
                tone: "info" as const,
              };
              const isOpen = expanded.has(entry.id);
              return (
                <li key={entry.id} className="border-b border-border last:border-0">
                  <button
                    onClick={() => toggle(entry.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/50"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5 text-text-subtle" />
                    ) : (
                      <ChevronRight className="size-3.5 text-text-subtle" />
                    )}
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="text-xs font-medium">{entry.table_name}</span>
                    <span className="text-2xs flex-1 truncate font-mono text-text-subtle">
                      {entry.record_id}
                    </span>
                    {entry.changer_name && (
                      <span className="text-xs text-text-muted">{entry.changer_name}</span>
                    )}
                    <span className="text-2xs whitespace-nowrap text-text-subtle">
                      {formatDate(entry.changed_at, "dd/MM/yyyy HH:mm")}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-border bg-surface-2/40 px-12 py-3">
                      {entry.changed_fields && entry.changed_fields.length > 0 && (
                        <div>
                          <div className="text-2xs mb-1 font-medium tracking-wide text-text-subtle uppercase">
                            Campos alterados
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {entry.changed_fields.map((f) => (
                              <Badge key={f}>{f}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <DataBlock title="Antes" data={entry.old_data} tone="expense" />
                        <DataBlock title="Depois" data={entry.new_data} tone="income" />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>
            Página {filters.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => void setFilters({ page: filters.page - 1 })}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => void setFilters({ page: filters.page + 1 })}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DataBlock({
  title,
  data,
  tone,
}: {
  title: string;
  data: unknown;
  tone: "income" | "expense";
}) {
  return (
    <div>
      <div
        className={cn(
          "text-2xs mb-1 font-medium tracking-wide uppercase",
          tone === "income" ? "text-income" : "text-expense",
        )}
      >
        {title}
      </div>
      <pre className="text-2xs max-h-[200px] overflow-auto rounded-[var(--radius-sm)] border border-border bg-surface p-2 font-mono text-text-muted">
        {data == null ? "—" : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
