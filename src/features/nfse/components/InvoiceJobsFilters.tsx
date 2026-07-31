import * as React from "react";
import { Search, X } from "lucide-react";

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

import type { PagarmeAccount } from "../api";
import {
  AMBIENTE_FILTER_OPTIONS,
  DATE_FIELD_OPTIONS,
  JOB_STATUS_FILTERS,
  ORIGIN_FILTER_OPTIONS,
} from "../constants";
import { jobPeriodPresets } from "../job-filters";
import {
  countActiveJobFilters,
  type InvoiceJobFilterState,
  type useInvoiceJobFilters,
} from "../useInvoiceJobFilters";

const SEARCH_DEBOUNCE_MS = 350;

interface Props {
  filters: InvoiceJobFilterState;
  setFilters: ReturnType<typeof useInvoiceJobFilters>["setFilters"];
  reset: () => void;
  connections: PagarmeAccount[];
}

export function InvoiceJobsFilters({ filters, setFilters, reset, connections }: Props) {
  const presets = React.useMemo(() => jobPeriodPresets(), []);
  const activeCount = countActiveJobFilters(filters);

  // a busca vai para a URL com folga, para não consultar a cada tecla
  const [term, setTerm] = React.useState(filters.search);
  React.useEffect(() => setTerm(filters.search), [filters.search]);
  React.useEffect(() => {
    if (term === filters.search) return;
    const timer = setTimeout(() => setFilters({ search: term }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, filters.search, setFilters]);

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <Label htmlFor="nfse-search">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" />
            <Input
              id="nfse-search"
              placeholder="Tomador, CPF/CNPJ, número, chave, charge id…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nfse-status">Status</Label>
          <Select
            value={filters.status}
            onValueChange={(v) => setFilters({ status: v as InvoiceJobFilterState["status"] })}
          >
            <SelectTrigger id="nfse-status" className="w-[190px]">
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nfse-ambiente">Ambiente</Label>
          <Select
            value={filters.ambiente}
            onValueChange={(v) => setFilters({ ambiente: v as InvoiceJobFilterState["ambiente"] })}
          >
            <SelectTrigger id="nfse-ambiente" className="w-[180px]">
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nfse-origin">Origem</Label>
          <Select
            value={filters.origin}
            onValueChange={(v) => setFilters({ origin: v as InvoiceJobFilterState["origin"] })}
          >
            <SelectTrigger id="nfse-origin" className="w-[200px]">
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nfse-connection">Conexão</Label>
          <Select value={filters.accountId} onValueChange={(v) => setFilters({ accountId: v })}>
            <SelectTrigger id="nfse-connection" className="w-[200px]">
              <SelectValue />
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
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nfse-date-field">Filtrar por</Label>
          <Select
            value={filters.dateField}
            onValueChange={(v) =>
              setFilters({ dateField: v as InvoiceJobFilterState["dateField"] })
            }
          >
            <SelectTrigger id="nfse-date-field" className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FIELD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nfse-from">De</Label>
          <Input
            id="nfse-from"
            type="date"
            className="w-[160px]"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => setFilters({ from: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nfse-to">Até</Label>
          <Input
            id="nfse-to"
            type="date"
            className="w-[160px]"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => setFilters({ to: e.target.value })}
          />
        </div>

        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              size="sm"
              variant={filters.from === p.from && filters.to === p.to ? "primary" : "ghost"}
              onClick={() => setFilters({ from: p.from, to: p.to })}
            >
              {p.label}
            </Button>
          ))}
          {(filters.from || filters.to) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setFilters({ from: "", to: "" })}
            >
              <X className="size-3.5" /> Período
            </Button>
          )}
        </div>

        {activeCount > 0 && (
          <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={reset}>
            <X className="size-3.5" /> Limpar filtros ({activeCount})
          </Button>
        )}
      </div>
    </div>
  );
}
