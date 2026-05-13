import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  ArrowLeftRight,
  Building2,
  FileBarChart,
  History,
  LayoutDashboard,
  Plus,
  Repeat,
  Search,
  Settings,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";

import { useCompanyScope } from "@/features/companies/CompanyContext";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";
import { supabase } from "@/lib/supabase";

interface PaletteContextValue {
  open: () => void;
  close: () => void;
}
const PaletteCtx = React.createContext<PaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = React.useContext(PaletteCtx);
  if (!ctx) throw new Error("useCommandPalette must be used inside CommandPalette");
  return ctx;
}

const NAV_ITEMS = [
  { path: "/", label: "Visão geral", icon: LayoutDashboard, kws: "dashboard home início" },
  { path: "/transactions", label: "Lançamentos", icon: ArrowLeftRight, kws: "transactions" },
  { path: "/dre", label: "DRE", icon: FileBarChart, kws: "demonstrativo resultado" },
  { path: "/cashflow", label: "Fluxo de Caixa", icon: TrendingUp, kws: "cashflow caixa" },
  { path: "/payroll", label: "Folha de pagamento", icon: Users, kws: "payroll" },
  { path: "/recurring", label: "Recorrências", icon: Repeat, kws: "recurring" },
  { path: "/import", label: "Importar CSV", icon: Upload, kws: "import csv" },
  { path: "/audit", label: "Auditoria", icon: History, kws: "audit log historico" },
  { path: "/companies", label: "Empresas", icon: Building2, kws: "companies" },
  { path: "/settings", label: "Configurações", icon: Settings, kws: "settings config" },
];

export function CommandPalette({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const navigate = useNavigate();
  const { selectedCompanyId, isConsolidated } = useCompanyScope();

  const openPalette = React.useCallback(() => {
    setOpen(true);
  }, []);
  const closePalette = React.useCallback(() => {
    setOpen(false);
  }, []);

  // ⌘K / Ctrl+K toggle
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced query for transactions search
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const txSearch = useQuery({
    queryKey: ["command-palette", "transactions", debounced, selectedCompanyId, isConsolidated],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select(
          "id, description, amount, direction, accrual_date, company:companies!transactions_company_id_fkey(trade_name, legal_name)",
        )
        .is("deleted_at", null)
        .ilike("description", `%${debounced}%`)
        .order("accrual_date", { ascending: false })
        .limit(10);
      if (!isConsolidated && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && debounced.length >= 2,
  });

  function go(path: string) {
    setOpen(false);
    setQuery("");
    void navigate(path);
  }

  return (
    <PaletteCtx.Provider value={{ open: openPalette, close: closePalette }}>
      {children}

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Command palette"
        className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 grid place-items-start justify-center bg-black/40 pt-[15vh] backdrop-blur-sm"
      >
        <div className="w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-4 text-text-subtle" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar lançamentos, navegar…"
              className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-text-subtle"
            />
            <kbd className="text-2xs rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-text-muted">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-text-muted">
              Nenhum resultado.
            </Command.Empty>

            <Command.Group heading="Ações rápidas" className="cmd-group">
              <Command.Item
                value="novo lancamento new transaction"
                onSelect={() => go("/transactions?new=1")}
                className="cmd-item"
              >
                <Plus className="size-4 text-accent" />
                <span>Novo lançamento</span>
                <kbd className="kbd-hint">N</kbd>
              </Command.Item>
              <Command.Item
                value="importar csv import"
                onSelect={() => go("/import")}
                className="cmd-item"
              >
                <Upload className="size-4 text-accent" />
                <span>Importar CSV</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Navegação" className="cmd-group">
              {NAV_ITEMS.map((item) => (
                <Command.Item
                  key={item.path}
                  value={`${item.label} ${item.kws}`}
                  onSelect={() => go(item.path)}
                  className="cmd-item"
                >
                  <item.icon className="size-4 text-text-muted" />
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {debounced.length >= 2 && (
              <Command.Group heading="Lançamentos" className="cmd-group">
                {txSearch.isLoading && (
                  <div className="px-2 py-1.5 text-xs text-text-subtle">Buscando…</div>
                )}
                {txSearch.data?.map((t) => (
                  <Command.Item
                    key={t.id}
                    value={`tx-${t.id}-${t.description}`}
                    onSelect={() => go("/transactions")}
                    className="cmd-item"
                  >
                    <ArrowLeftRight className="size-4 text-text-muted" />
                    <span className="flex-1 truncate">{t.description}</span>
                    <span className="text-2xs whitespace-nowrap text-text-subtle">
                      {formatDate(t.accrual_date)}
                    </span>
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        t.direction === "inflow" ? "text-income" : "text-expense"
                      }`}
                    >
                      {t.direction === "inflow" ? "+" : "-"} {formatBRL(t.amount)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </div>
      </Command.Dialog>
    </PaletteCtx.Provider>
  );
}
