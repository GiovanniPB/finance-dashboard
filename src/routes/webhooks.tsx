import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WEBHOOK_EVENTS } from "@/features/integrations/events";
import { useCronStatus, useObservedEventTypes } from "@/features/integrations/hooks";
import { WebhooksPanel } from "@/features/nfse/components/WebhooksPanel";
import { useConnections } from "@/features/nfse/hooks";
import { formatDate } from "@/lib/dates";

/**
 * Webhooks e automação: o que entra sozinho no sistema.
 *
 * Reúne as duas metades que antes não conversavam: os webhooks (o provedor nos
 * chama) e os crons (nós chamamos o provedor). As duas falham em silêncio — evento
 * não assinado não gera erro, e cron sem segredo no Vault sai calado —, então a
 * tela mostra estado, não só log.
 */
export default function WebhooksPage() {
  const { data: connections = [] } = useConnections();
  const observed = useObservedEventTypes();
  const crons = useCronStatus();

  const production = connections.filter((c) => c.ambiente === "producao");

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Administração
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Webhooks</h1>
          <p className="mt-1 text-sm text-text-muted">
            O que chega do provedor e o que a esteira busca sozinha. Endereço e eventos de cada
            conexão ficam na página dela.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/integracoes">
            Integrações <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cobertura por conexão</CardTitle>
          <CardDescription>
            Não há API para ler a assinatura de eventos no painel do pagar.me — a evidência é o que
            chegou na fila. Poucos tipos recebidos costuma significar assinatura incompleta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {observed.isError ? (
            <p className="text-sm text-text-muted">
              Sem permissão para ler a fila de eventos (restrito a administradores).
            </p>
          ) : observed.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            production.map((c) => {
              const seen = new Set(
                (observed.data ?? [])
                  .filter((o) => o.pagarmeAccountId === c.id)
                  .map((o) => o.eventType),
              );
              const missingRequired = WEBHOOK_EVENTS.filter((e) => e.required && !seen.has(e.type));
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="text-2xs text-text-subtle">
                      {seen.size} de {WEBHOOK_EVENTS.length} tipos tratados já foram recebidos
                    </div>
                    {missingRequired.length > 0 ? (
                      <div className="text-2xs mt-1 flex items-start gap-1.5 text-warning">
                        <CircleAlert className="mt-0.5 size-3 shrink-0" />
                        falta {missingRequired.map((e) => e.type).join(", ")}
                      </div>
                    ) : null}
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/integracoes/${c.slug}`}>Ver endereço e eventos</Link>
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4 text-accent" />
            Automação (pg_cron)
          </CardTitle>
          <CardDescription>
            Liquidação, maturidade, assinaturas e carga histórica. Um agendamento ativo sem os
            segredos <code>pagarme_sync_url</code> / <code>pagarme_sync_secret</code> no Vault roda
            sem fazer nada — é o modo de falha silenciosa desta integração.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {crons.isError ? (
            <p className="text-sm text-text-muted">
              Sem permissão para ver os agendamentos (restrito a super admin).
            </p>
          ) : crons.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (crons.data ?? []).length === 0 ? (
            <p className="text-sm text-text-muted">Nenhum agendamento encontrado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(crons.data ?? []).map((job) => (
                <li
                  key={job.jobName}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
                >
                  <div className="min-w-0">
                    <code className="font-mono text-xs">{job.jobName}</code>
                    <div className="text-2xs text-text-subtle">{job.schedule}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {job.lastRunAt ? (
                      <span className="text-2xs text-text-subtle">
                        última {formatDate(job.lastRunAt, "dd/MM HH:mm")}
                      </span>
                    ) : (
                      <span className="text-2xs text-text-subtle">nunca executou</span>
                    )}
                    {job.lastStatus === "succeeded" ? (
                      <Badge tone="income">ok</Badge>
                    ) : job.lastStatus ? (
                      <Badge tone="expense">{job.lastStatus}</Badge>
                    ) : null}
                    {!job.active ? <Badge tone="warning">desativado</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fila de eventos</CardTitle>
          <CardDescription>
            Log bruto do que chegou, para depuração. Atualiza sozinho a cada 15s.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WebhooksPanel />
        </CardContent>
      </Card>
    </div>
  );
}
