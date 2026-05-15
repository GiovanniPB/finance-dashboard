import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountsByCompany } from "@/features/accounts/hooks";
import { cn } from "@/lib/cn";

interface Props {
  companyId: string | null;
  value: string | null;
  onChange: (accountId: string) => void;
  /** Restrict to accounts with these `kind` values (optional). */
  kindFilter?: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function AccountCombobox({
  companyId,
  value,
  onChange,
  kindFilter,
  placeholder = "Selecione uma conta…",
  disabled,
  id,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const { data: accounts = [], isLoading } = useAccountsByCompany(companyId);

  const filtered = React.useMemo(() => {
    let list = accounts;
    if (kindFilter && kindFilter.length > 0) {
      list = list.filter((a) => kindFilter.includes(a.kind));
    }
    if (search.trim() !== "") {
      const q = search.toLowerCase();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
      );
    }
    return list;
  }, [accounts, kindFilter, search]);

  const selected = accounts.find((a) => a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={Boolean(disabled) || !companyId}
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
              <>
                <span className="text-2xs font-mono text-text-subtle">{selected.code}</span>
                <span className="truncate text-text">{selected.name}</span>
              </>
            ) : (
              <span className="text-text-subtle">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-text-subtle" />
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
            placeholder="Buscar por nome ou código…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-subtle"
          />
        </div>
        <div
          className="max-h-[280px] overflow-y-auto p-1"
          onWheel={(e) => {
            // Radix Dialog/Sheet (modal) uses react-remove-scroll which
            // preventDefaults wheel events outside the Dialog tree. Since this
            // Popover is portal-mounted at body level (sibling of Dialog),
            // the browser's default scroll is cancelled before reaching us.
            // Apply the scroll programmatically as a workaround.
            e.currentTarget.scrollTop += e.deltaY;
          }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-text-subtle">
              <Loader2 className="size-3.5 animate-spin" /> Carregando contas…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-subtle">
              Nenhuma conta encontrada
            </div>
          ) : (
            filtered.map((a) => {
              const isSelected = a.id === value;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onChange(a.id);
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
                    <span className="truncate">{a.name}</span>
                    <span className="text-2xs font-mono text-text-subtle">{a.code}</span>
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
