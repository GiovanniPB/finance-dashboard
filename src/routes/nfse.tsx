import { parseAsStringLiteral, useQueryState } from "nuqs";

import { useCompanyScope } from "@/features/companies/CompanyContext";
import { ConnectionsPanel } from "@/features/nfse/components/ConnectionsPanel";
import { FiscalSettingsPanel } from "@/features/nfse/components/FiscalSettingsPanel";
import { InvoiceJobsPanel } from "@/features/nfse/components/InvoiceJobsPanel";
import { cn } from "@/lib/cn";

const TABS = [
  { value: "notes", label: "Notas" },
  { value: "connections", label: "Conexões pagar.me" },
  { value: "fiscal", label: "Configuração fiscal" },
] as const;

export default function NfsePage() {
  const { companies, loading } = useCompanyScope();
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS.map((t) => t.value)).withDefault("notes"),
  );

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div>
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
          NFS-e · Integração pagar.me × Focus
        </div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          Emissão de NFS-e
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Gerencie as conexões pagar.me e a configuração fiscal das empresas que emitem nota.
        </p>
      </div>

      <div className="flex gap-1 rounded-[var(--radius-md)] border border-border bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => void setTab(t.value)}
            className={cn(
              "flex-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.value
                ? "bg-surface text-text shadow-sm"
                : "text-text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "notes" && <InvoiceJobsPanel />}
      {tab === "connections" && <ConnectionsPanel companies={companies} />}
      {tab === "fiscal" && <FiscalSettingsPanel companies={companies} />}

      {loading && tab !== "notes" && (
        <p className="text-2xs text-text-subtle">Carregando empresas…</p>
      )}
    </div>
  );
}
