import { Repeat, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";

import type { SalesRecurrence } from "../api";

interface Props {
  data: SalesRecurrence | undefined;
  loading: boolean;
}

/**
 * Recorrência com as DUAS definições que o grupo realmente tem.
 *
 * A conta da Jimmy vende assinatura anual (objeto `subscription` no pagar.me), a
 * da RCO vende contrato pago em 12x — sem assinatura nenhuma. Então não existe um
 * MRR/churn único para o grupo: o card mostra o bloco que se aplica ao escopo
 * consultado e diz explicitamente qual é, em vez de exibir zero como se fosse
 * "não houve churn".
 */
export function RecurrenceCard({ data, loading }: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recorrência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isSubscription = data?.hasSubscriptions ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Recorrência</CardTitle>
            <CardDescription>
              {isSubscription
                ? "Assinaturas do pagar.me: MRR e churn do objeto assinatura."
                : "Sem assinaturas nesta conexão: a recorrência é o contrato parcelado, medido pelo backlog de recebíveis."}
            </CardDescription>
          </div>
          <Badge tone={isSubscription ? "info" : "default"}>
            {isSubscription ? "Modelo assinatura" : "Modelo parcelado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSubscription ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="MRR ativo" value={formatBRL(data?.mrrActive ?? 0)} />
            <Metric label="Assinaturas ativas" value={formatNumber(data?.subsActive ?? 0)} />
            <Metric
              label="Novas no período"
              value={formatNumber(data?.subsNew ?? 0)}
              tone="income"
            />
            <Metric
              label="Canceladas"
              value={formatNumber(data?.subsCanceled ?? 0)}
              tone={data && data.subsCanceled > 0 ? "expense" : "default"}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric
            label="Backlog contratado"
            value={formatBRL(data?.contractedReceivables ?? 0)}
            hint={`${formatNumber(data?.contractedInstallments ?? 0)} parcelas`}
          />
          {isSubscription ? (
            <Metric
              label="Churn de logo"
              value={
                data?.churnRateLogo === null || data?.churnRateLogo === undefined
                  ? "—"
                  : formatPercent(data.churnRateLogo, { fromHundred: true })
              }
              hint="canceladas ÷ ativas no início"
              tone={data?.churnRateLogo ? "expense" : "default"}
            />
          ) : null}
          <Metric
            label="Cobranças recusadas em assinatura"
            value={formatNumber(data?.involuntaryFailed ?? 0)}
            hint="churn involuntário"
            tone={data && data.involuntaryFailed > 0 ? "expense" : "default"}
          />
        </div>

        {!isSubscription ? (
          <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-xs text-text-muted">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Nesta conexão o churn não pode vir do pagar.me: sem objeto assinatura, a perda de
              cliente só aparece como <strong>não-renovação</strong> ao fim do parcelamento — que o
              provedor não registra. Use o backlog e a taxa de recompra como proxy.
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "income" | "expense";
}

function Metric({ label, value, hint, tone = "default" }: MetricProps) {
  const toneClass =
    tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : undefined;
  return (
    <div>
      <div className="text-2xs flex items-center gap-1 font-medium tracking-wide text-text-subtle uppercase">
        <Repeat className="size-3" />
        {label}
      </div>
      <div
        className={`mt-1 font-display text-lg font-semibold tracking-tight ${toneClass ?? ""}`.trim()}
      >
        {value}
      </div>
      {hint ? <div className="text-xs text-text-muted">{hint}</div> : null}
    </div>
  );
}
