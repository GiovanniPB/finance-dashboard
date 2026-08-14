import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, FileText, Plug, Plus, Webhook } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import type { PagarmeAccount } from "@/features/nfse/api";
import { AMBIENTE_META } from "@/features/nfse/constants";
import { useConnections, useFiscalSettings } from "@/features/nfse/hooks";

/**
 * Índice das integrações do grupo.
 *
 * Existe porque a configuração estava espalhada por abas de duas telas de
 * operação (NFS-e e Vendas), o que escondia o fato de que é UMA integração
 * servindo dois consumidores: a mesma conexão pagar.me alimenta a emissão de nota
 * e o dashboard de vendas. Aqui cada integração é um cartão com o estado real, e o
 * clique leva à página com toda a configuração dela.
 */
export default function IntegracoesPage() {
  const { data: connections = [], isLoading } = useConnections();
  const { data: fiscalSettings = [] } = useFiscalSettings();
  const { canManage } = usePermissions();

  const production = connections.filter((c) => c.ambiente === "producao");
  const sandbox = connections.filter((c) => c.ambiente !== "producao");
  const fiscalEnabled = fiscalSettings.filter((s) => s.enabled).length;
  const fiscalPending = fiscalSettings.filter((s) => !s.focus_token_ref).length;

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Administração
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Integrações</h1>
          <p className="mt-1 text-sm text-text-muted">
            Serviços externos conectados ao sistema. A conexão pagar.me serve tanto a emissão de
            nota quanto o dashboard de vendas — configuração única, dois consumidores.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/webhooks">
              <Webhook className="size-4" /> Webhooks
            </Link>
          </Button>
          {canManage ? (
            <Button asChild>
              <Link to="/integracoes/nova">
                <Plus className="size-4" /> Nova conexão
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-wide text-text-muted uppercase">
          Gateway de pagamento · pagar.me
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : connections.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-text-muted">
              Nenhuma conexão pagar.me cadastrada.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[...production, ...sandbox].map((c) => (
              <ConnectionCard key={c.id} connection={c} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-wide text-text-muted uppercase">
          Emissor fiscal · Focus NFe
        </h2>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4 text-accent" />
                  Focus NFe
                </CardTitle>
                <CardDescription>
                  Emissor das notas. O token e a classificação fiscal são de cada empresa — por isso
                  moram no cadastro da empresa, não aqui.
                </CardDescription>
              </div>
              <Button variant="outline" asChild>
                <Link to="/companies">
                  Configuração fiscal <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <span className="text-text-muted">
              <strong className="font-mono text-sm text-text">{fiscalEnabled}</strong>{" "}
              {fiscalEnabled === 1 ? "empresa emitindo" : "empresas emitindo"}
            </span>
            {fiscalPending > 0 ? (
              <span className="flex items-center gap-1.5 text-warning">
                <CircleAlert className="size-3.5" />
                {fiscalPending} sem token do Focus
              </span>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ConnectionCard({ connection }: { connection: PagarmeAccount }) {
  const amb = AMBIENTE_META[connection.ambiente];
  const owner = connection.owner?.trade_name ?? connection.owner?.legal_name ?? "—";
  const isProduction = connection.ambiente === "producao";

  // pendências que impedem a integração de funcionar por inteiro
  const gaps: string[] = [];
  if (!connection.webhook_secret_ref) gaps.push("webhook sem segredo");
  if (!connection.api_secret_ref) gaps.push("sem secret key da API");

  return (
    <Card className="transition-colors hover:border-border-strong">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Plug className="size-4 text-accent" />
              {connection.label}
            </CardTitle>
            <code className="text-2xs text-text-subtle">{connection.slug}</code>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={amb.tone}>{amb.label}</Badge>
            <Badge tone={connection.active ? "income" : "default"}>
              {connection.active ? "Ativa" : "Inativa"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-2xs tracking-wide text-text-subtle uppercase">Empresa dona</dt>
            <dd className="text-text">{owner}</dd>
          </div>
          <div>
            <dt className="text-2xs tracking-wide text-text-subtle uppercase">Alimenta</dt>
            <dd className="text-text">{isProduction ? "notas + vendas" : "só notas (sandbox)"}</dd>
          </div>
        </dl>

        {gaps.length > 0 ? (
          <p className="text-2xs flex items-start gap-1.5 text-warning">
            <CircleAlert className="mt-0.5 size-3 shrink-0" />
            {gaps.join(" · ")}
          </p>
        ) : null}

        <Button variant="secondary" className="w-full" asChild>
          <Link to={`/integracoes/${connection.slug}`}>
            Configurar <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
