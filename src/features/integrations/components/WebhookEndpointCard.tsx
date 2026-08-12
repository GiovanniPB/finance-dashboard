import * as React from "react";
import { AlertTriangle, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PagarmeAccount } from "@/features/nfse/api";
import { webhookUrl } from "@/features/nfse/constants";
import { useRotateWebhookSecret } from "@/features/nfse/hooks";
import { formatDate } from "@/lib/dates";

import { IGNORED_EVENT_TYPES, PURPOSE_LABELS, WEBHOOK_EVENTS } from "../events";
import { useObservedEventTypes } from "../hooks";

interface Props {
  connection: PagarmeAccount;
}

/**
 * Endpoint de webhook de uma conexão: endereço, segredo e o que está assinado.
 *
 * Não existe API para LER quais eventos estão assinados no painel do pagar.me, e
 * a integração inteira depende disso — foi assim que ficamos meses recebendo só
 * `charge.paid` sem ninguém notar. Então a tela usa a única evidência que existe:
 * o que de fato chegou na fila. "Nunca recebido" não prova que não está assinado
 * (pode ser evento que não aconteceu), e a coluna diz isso.
 */
export function WebhookEndpointCard({ connection }: Props) {
  const rotate = useRotateWebhookSecret();
  const observed = useObservedEventTypes();
  const [revealedUrl, setRevealedUrl] = React.useState<string | null>(null);

  const seen = new Map(
    (observed.data ?? [])
      .filter((o) => o.pagarmeAccountId === connection.id)
      .map((o) => [o.eventType, o]),
  );

  const publicUrl = webhookUrl(connection.slug);
  const missingRequired = WEBHOOK_EVENTS.filter((e) => e.required && !seen.has(e.type));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Webhook</CardTitle>
            <CardDescription>
              Um endpoint por conexão. O roteador decide pelo tipo do evento — o mesmo endereço
              serve nota e vendas.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={rotate.isPending}
            onClick={() =>
              rotate.mutate(connection.id, {
                onSuccess: (secret) => setRevealedUrl(webhookUrl(connection.slug, secret)),
                onError: (err) =>
                  toast.error("Erro ao gerar segredo", { description: err.message }),
              })
            }
          >
            {rotate.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {connection.webhook_secret_ref ? "Rotacionar segredo" : "Gerar URL"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Endereço
          </div>
          <UrlRow url={revealedUrl ?? publicUrl} />
          {revealedUrl ? (
            <p className="text-2xs flex items-start gap-1 text-warning">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              URL completa com o segredo novo. Copie e atualize no pagar.me agora — não será exibida
              de novo, e o segredo antigo deixou de valer.
            </p>
          ) : connection.webhook_secret_ref ? (
            <p className="text-2xs text-text-subtle">
              Segredo configurado. O endereço acima está sem ele por segurança; use “Rotacionar” se
              precisar cadastrar de novo.
            </p>
          ) : (
            <p className="text-2xs text-warning">
              Sem segredo: esta conexão rejeita todo webhook. Gere a URL para ativá-la.
            </p>
          )}
        </div>

        {missingRequired.length > 0 ? (
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Nunca chegou nenhum evento de{" "}
              <strong>{missingRequired.map((e) => e.type).join(", ")}</strong>. Se já houve estorno
              ou chargeback nesta conexão, eles não estão assinados no painel do pagar.me — e a
              dedução de receita correspondente não existe no financeiro.
            </span>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Eventos tratados pelo roteador
          </div>
          <ul className="divide-y divide-border">
            {WEBHOOK_EVENTS.map((spec) => {
              const hit = seen.get(spec.type);
              return (
                <li key={spec.type} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <code className="font-mono text-xs">{spec.type}</code>
                  <Badge>{PURPOSE_LABELS[spec.purpose]}</Badge>
                  {spec.required ? <Badge tone="accent">essencial</Badge> : null}
                  <span className="text-2xs min-w-0 flex-1 text-text-subtle">{spec.unlocks}</span>
                  {hit ? (
                    <span className="text-2xs text-income">
                      {hit.events} recebido(s) · último {formatDate(hit.lastAt, "dd/MM HH:mm")}
                    </span>
                  ) : observed.isError ? (
                    <span className="text-2xs text-text-subtle">sem visibilidade</span>
                  ) : (
                    <span className="text-2xs text-text-subtle">nunca recebido</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-2xs text-text-subtle">
            Não assine <code>{IGNORED_EVENT_TYPES.join(", ")}</code>: o roteador os reconhece e
            ignora de propósito (não trazem a assinatura completa), então só gerariam ruído na fila.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function UrlRow({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };
  return (
    <div className="flex items-center gap-2">
      <code className="text-2xs flex-1 truncate rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 py-1.5 font-mono">
        {url}
      </code>
      <Button type="button" size="icon" variant="outline" onClick={copy} aria-label="Copiar URL">
        {copied ? <Check className="size-4 text-income" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}
