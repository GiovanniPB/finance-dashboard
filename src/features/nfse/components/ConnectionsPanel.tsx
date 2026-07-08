import * as React from "react";
import { FlaskConical, Plus, Users2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Company } from "@/features/companies/api";

import type { PagarmeAccount } from "../api";
import { AMBIENTE_META } from "../constants";
import { useConnections } from "../hooks";
import { ConnectionDrawer } from "./ConnectionDrawer";
import { RecipientsSheet } from "./RecipientsSheet";
import { TestChargeDrawer } from "./TestChargeDrawer";

export function ConnectionsPanel({ companies }: { companies: Company[] }) {
  const { data: connections = [], isLoading } = useConnections();
  const [editing, setEditing] = React.useState<PagarmeAccount | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [recipientsOf, setRecipientsOf] = React.useState<PagarmeAccount | null>(null);
  const [testingOf, setTestingOf] = React.useState<PagarmeAccount | null>(null);

  const drawerOpen = creating || Boolean(editing);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          Cada conta pagar.me é uma conexão com endpoint e segredo próprios.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Nova conexão
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : connections.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma conexão pagar.me cadastrada. Clique em "Nova conexão" para começar.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                <th className="px-3 py-2.5 text-left">Conexão</th>
                <th className="px-3 py-2.5 text-left">Empresa dona</th>
                <th className="px-3 py-2.5 text-left">Ambiente</th>
                <th className="px-3 py-2.5 text-left">Segredo</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="w-52 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {connections.map((c) => {
                const amb = AMBIENTE_META[c.ambiente];
                const owner = c.owner?.trade_name ?? c.owner?.legal_name ?? "—";
                return (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{c.label}</div>
                      <code className="text-2xs text-text-subtle">{c.slug}</code>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">{owner}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={amb.tone}>{amb.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.webhook_secret_ref ? (
                        <Badge tone="info">configurado</Badge>
                      ) : (
                        <Badge tone="warning">pendente</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={c.active ? "income" : "default"}>
                        {c.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.ambiente === "homologacao" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTestingOf(c)}
                            title="Gerar cobrança de teste no sandbox"
                          >
                            <FlaskConical className="size-3.5" /> Testar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setRecipientsOf(c)}>
                          <Users2 className="size-3.5" /> Recebedores
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                          Editar
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConnectionDrawer
        open={drawerOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        connection={editing}
        companies={companies}
      />

      <RecipientsSheet
        open={Boolean(recipientsOf)}
        onOpenChange={(o) => !o && setRecipientsOf(null)}
        connection={recipientsOf}
        companies={companies}
      />

      <TestChargeDrawer
        open={Boolean(testingOf)}
        onOpenChange={(o) => !o && setTestingOf(null)}
        connection={testingOf}
      />
    </div>
  );
}
