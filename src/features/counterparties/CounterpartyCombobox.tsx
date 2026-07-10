import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

import type { Counterparty, CounterpartyKind } from "./api";
import { useCounterparties, useCreateCounterparty } from "./hooks";

/** Nome mínimo aceito pelo schema de contraparte. */
const MIN_NAME_LENGTH = 2;

interface Props {
  organizationId: string | null;
  value: string | null;
  onChange: (counterpartyId: string | null) => void;
  /** Restrict to a single kind (e.g. "supplier"). */
  kind?: CounterpartyKind | null;
  /** Tipo aplicado ao criar uma contraparte rápida pela busca. */
  createKind?: CounterpartyKind;
  /** Permite criar uma nova contraparte a partir do termo buscado. */
  allowCreate?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function CounterpartyCombobox({
  organizationId,
  value,
  onChange,
  kind,
  createKind = "supplier",
  allowCreate = true,
  placeholder = "Selecione um fornecedor/cliente…",
  disabled,
  id,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  // Contrapartes criadas nesta sessão: garantem seleção imediata sem esperar o refetch.
  const [localCreated, setLocalCreated] = React.useState<Counterparty[]>([]);
  const { data: counterparties = [], isLoading } = useCounterparties({
    organizationId: organizationId ?? "",
    kind: kind ?? null,
  });
  const create = useCreateCounterparty();

  const all = React.useMemo(() => {
    const ids = new Set(counterparties.map((c) => c.id));
    return [...counterparties, ...localCreated.filter((c) => !ids.has(c.id))];
  }, [counterparties, localCreated]);

  const trimmed = search.trim();

  const filtered = React.useMemo(() => {
    const active = all.filter((c) => c.is_active || c.id === value);
    if (trimmed === "") return active;
    const q = trimmed.toLowerCase();
    return active.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.document ?? "").toLowerCase().includes(q),
    );
  }, [all, trimmed, value]);

  const selected = all.find((c) => c.id === value);

  const hasExactMatch = all.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  const canCreate =
    allowCreate && Boolean(organizationId) && trimmed.length >= MIN_NAME_LENGTH && !hasExactMatch;

  function handleCreate() {
    if (!organizationId || !canCreate || create.isPending) return;
    create.mutate(
      { organization_id: organizationId, name: trimmed, kind: createKind, is_active: true },
      {
        onSuccess: (created) => {
          setLocalCreated((prev) => [...prev, created]);
          onChange(created.id);
          setOpen(false);
          setSearch("");
          toast.success("Fornecedor criado", { description: created.name });
        },
        onError: (err) => {
          toast.error("Erro ao criar fornecedor", { description: err.message });
        },
      },
    );
  }

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
            onKeyDown={(e) => {
              // Enter cria a contraparte quando a busca não corresponde a nenhuma existente.
              if (e.key === "Enter" && canCreate && filtered.length === 0) {
                e.preventDefault();
                handleCreate();
              }
            }}
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
          ) : (
            <>
              {filtered.map((c) => {
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
              })}

              {filtered.length === 0 && !canCreate && (
                <div className="py-6 text-center text-xs text-text-subtle">
                  {trimmed === ""
                    ? "Nenhuma contraparte encontrada"
                    : "Digite ao menos 2 caracteres para criar"}
                </div>
              )}

              {canCreate && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={create.isPending}
                  className={cn(
                    "mt-1 flex w-full items-center gap-2 rounded-[var(--radius-sm)] border-t border-border px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-60",
                    filtered.length === 0 && "border-t-0",
                  )}
                >
                  {create.isPending ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />
                  ) : (
                    <Plus className="size-3.5 shrink-0 text-accent" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    Criar <span className="font-medium text-text">“{trimmed}”</span>
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
