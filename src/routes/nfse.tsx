import { Link } from "react-router-dom";
import { Plug } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";

import { Button } from "@/components/ui/button";
import { BackfillPanel } from "@/features/nfse/components/BackfillPanel";
import { InvoiceJobsPanel } from "@/features/nfse/components/InvoiceJobsPanel";
import { cn } from "@/lib/cn";

/**
 * Operação da emissão de NFS-e.
 *
 * Só operação: a fila de notas e a emissão retroativa. Configuração saiu daqui —
 * conexão pagar.me e webhook em Integrações, classificação fiscal no cadastro da
 * empresa. Misturar as duas coisas era o que fazia esta tela crescer em abas que
 * ninguém abria no dia a dia.
 */
const TABS = [
  { value: "notes", label: "Notas" },
  { value: "backfill", label: "Emissão retroativa" },
] as const;

export default function NfsePage() {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS.map((t) => t.value)).withDefault("notes"),
  );

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            NFS-e · Integração pagar.me × Focus
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            Emissão de NFS-e
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Fila de notas e reemissão. Conexões e webhooks ficam em Integrações; emitente e
            classificação fiscal, no cadastro da empresa.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/integracoes">
            <Plug className="size-4" /> Integrações
          </Link>
        </Button>
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
      {tab === "backfill" && <BackfillPanel />}
    </div>
  );
}
