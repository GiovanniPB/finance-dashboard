import * as React from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Company } from "@/features/companies/api";

import { AMBIENTE_META, DOCUMENT_TYPE_META, EMISSION_MODE_OPTIONS } from "../constants";
import { useFiscalSettings } from "../hooks";

export function FiscalSettingsPanel({ companies }: { companies: Company[] }) {
  const { data: settings = [], isLoading } = useFiscalSettings();

  const byCompany = React.useMemo(
    () => new Map(settings.map((s) => [s.company_id, s])),
    [settings],
  );

  const modeLabel = (v: string) => EMISSION_MODE_OPTIONS.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Tipo de documento (NF-e produto / NFS-e serviço), emitente, token Focus e classificação
        fiscal por empresa.
      </p>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : companies.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma empresa cadastrada.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                <th className="px-3 py-2.5 text-left">Empresa</th>
                <th className="px-3 py-2.5 text-left">Tipo</th>
                <th className="px-3 py-2.5 text-left">Ambiente</th>
                <th className="px-3 py-2.5 text-left">Modo</th>
                <th className="px-3 py-2.5 text-left">Token Focus</th>
                <th className="px-3 py-2.5 text-left">Emissão</th>
                <th className="w-28 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.map((c) => {
                const s = byCompany.get(c.id) ?? null;
                const amb = s ? AMBIENTE_META[s.ambiente] : null;
                return (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <td className="px-3 py-2.5 font-medium">{c.trade_name ?? c.legal_name}</td>
                    <td className="px-3 py-2.5">
                      {s ? (
                        <Badge tone={DOCUMENT_TYPE_META[s.document_type ?? "nfse"].tone}>
                          {DOCUMENT_TYPE_META[s.document_type ?? "nfse"].label}
                        </Badge>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {amb ? <Badge tone={amb.tone}>{amb.label}</Badge> : <Dash />}
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">
                      {s ? modeLabel(s.emission_mode) : <Dash />}
                    </td>
                    <td className="px-3 py-2.5">
                      {!s ? (
                        <Dash />
                      ) : s.focus_token_ref ? (
                        <Badge tone="info">configurado</Badge>
                      ) : (
                        <Badge tone="warning">pendente</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {!s ? (
                        <Badge tone="default">não configurada</Badge>
                      ) : s.enabled ? (
                        <Badge tone="income">habilitada</Badge>
                      ) : (
                        <Badge tone="warning">desligada</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/companies/${c.id}/fiscal`}>{s ? "Editar" : "Configurar"}</Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Dash() {
  return <span className="text-text-subtle">—</span>;
}
