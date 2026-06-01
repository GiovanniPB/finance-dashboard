import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

import type { CounterpartyKind } from "./api";
import { useCounterparties } from "./hooks";

interface Props {
  organizationId: string | null;
  value: string | null;
  onChange: (counterpartyId: string | null) => void;
  /** Restrict to a single kind (e.g. "supplier"). */
  kind?: CounterpartyKind | null;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function CounterpartyCombobox({
  organizationId,
  value,
  onChange,
  kind,
  placeholder = "Selecione um fornecedor/cliente…",
  disabled,
  id,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const { data: counterparties = [], isLoading } = useCounterparties({
    organizationId: organizationId ?? "",
    kind: kind ?? null,
  });

  const filtered = React.useMemo(() => {
    const active = counterparties.filter((c) => c.is_active || c.id === value);
    if (search.trim() === "") return active;
    const q = search.toLowerCase();
    return active.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.document ?? "").toLowerCase().includes(q),
    );
  }, [counterparties, search, value]);

  const selected = counterparties.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={Boolean(disabled) || !organizationId}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm",
            "transition-colors hover:border-border-strong",
            "focus:border-accent focus:ring-2 focus:ring-[var(--color-accent-ring)] focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          aria-expanded={open}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {selected ? (
              <span className="truncate text-text">{selected.name}</span>
            ) : (
              <span className="text-text-subtle">{placeholder}</span>
            )}
          </span>
          {selected ? (
            <X
              className="size-3.5 shrink-0 text-text-subtle hover:text-text"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          ) : (
            <ChevronsUpDown className="size-3.5 shrink-0 text-text-subtle" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[320px]"
        align="start"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-3.5 text-text-subtle" />
          <input
            autoFocus
            placeholder="Buscar por nome ou documento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-subtle"
          />
        </div>
        <div
          className="max-h-[280px] overflow-y-auto p-1"
          onWheel={(e) => {
            // Workaround for react-remove-scroll cancelling wheel events when
            // the Popover is portal-mounted as a sibling of a modal Sheet.
            e.currentTarget.scrollTop += e.deltaY;
          }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-text-subtle">
              <Loader2 className="size-3.5 animate-spin" /> Carregando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-subtle">
              Nenhuma contraparte encontrada
            </div>
          ) : (
            filtered.map((c) => {
              const isSelected = c.id === value;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-2",
                    isSelected && "bg-accent-soft text-accent",
                  )}
                >
                  <span className="mt-0.5 size-3.5">
                    {isSelected && <Check className="size-3.5" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{c.name}</span>
                    {c.document && (
                      <span className="text-2xs font-mono text-text-subtle">{c.document}</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
