import * as React from "react";
import { MoreHorizontal, Pencil, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { type Counterparty, type CounterpartyKind } from "@/features/counterparties/api";
import { CounterpartyDrawer } from "@/features/counterparties/components/CounterpartyDrawer";
import { useCounterparties } from "@/features/counterparties/hooks";
import { COUNTERPARTY_KINDS } from "@/features/counterparties/schema";
import { cn } from "@/lib/cn";

// Same hard-coded org id used throughout — could move to context later.
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

const KIND_LABELS = Object.fromEntries(COUNTERPARTY_KINDS.map((k) => [k.value, k.label]));

export default function SettingsCounterpartiesPage() {
  const { companies } = useCompanyScope();
  // organization id from first company if available, else use seeded constant
  const organizationId = companies[0]?.organization_id ?? ORGANIZATION_ID;

  const [kindFilter, setKindFilter] = React.useState<string>("");
  const [search, setSearch] = React.useState("");

  const { data: rows = [], isLoading } = useCounterparties({
    organizationId,
    kind: kindFilter === "" ? null : (kindFilter as CounterpartyKind),
    search: search || null,
  });

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Counterparty | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Contrapartes</h2>
          <p className="mt-1 text-sm text-text-muted">
            Clientes, fornecedores e demais parceiros vinculados aos lançamentos.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          <Plus className="size-4" /> Nova
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" />
          <Input
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="">Todos os tipos</option>
          {COUNTERPARTY_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma contraparte encontrada.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60">
              <tr className="border-b border-border">
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Documento</Th>
                <Th>Contato</Th>
                <Th align="right">Status</Th>
                <Th align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-surface-2/50",
                    !row.is_active && "opacity-60",
                  )}
                >
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {row.kind ? KIND_LABELS[row.kind] : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {row.document ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{row.email ?? row.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {row.is_active ? (
                      <Badge tone="income">Ativa</Badge>
                    ) : (
                      <Badge tone="default">Inativa</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label="Ações"
                          className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-2 hover:text-text"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(row);
                            setDrawerOpen(true);
                          }}
                        >
                          <Pencil className="size-4" /> Editar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CounterpartyDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        counterparty={editing}
        organizationId={organizationId}
      />
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "text-2xs px-4 py-2.5 font-medium tracking-wide text-text-subtle uppercase",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
