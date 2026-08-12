import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatNumber } from "@/lib/format";

import type { LedgerHealthIssue } from "../api";

/**
 * Rótulos e severidade dos furos de `v_pagarme_ledger_health`.
 *
 * Um ledger que espelha terceiro falha em silêncio se ninguém olhar — este card
 * existe para que a falha apareça. `warn` é informativo (antecipação não é erro);
 * `error` é receita ou dinheiro faltando.
 */
const ISSUE_META: Record<string, { label: string; severity: "error" | "warn" }> = {
  receivable_without_accrual: { label: "Recebível sem competência", severity: "error" },
  receivable_without_charge: { label: "Recebível sem a venda", severity: "warn" },
  receivable_overdue_unsettled: { label: "Recebível vencido sem liquidar", severity: "error" },
  receivable_anticipated: { label: "Recebíveis antecipados", severity: "warn" },
  settled_without_projection: { label: "Liquidado sem lançamento", severity: "error" },
  manual_pagarme_revenue_after_cutover: {
    label: "Receita manual após o corte",
    severity: "error",
  },
};

interface Props {
  data: LedgerHealthIssue[] | undefined;
  loading: boolean;
}

export function LedgerHealthCard({ data, loading }: Props) {
  if (loading) {
    return <Skeleton className="h-28 w-full" />;
  }

  const issues = data ?? [];
  const errors = issues.filter((i) => ISSUE_META[i.issue]?.severity !== "warn");

  if (issues.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <CheckCircle2 className="size-5 text-income" />
          <div>
            <div className="text-sm font-medium">Ledger íntegro</div>
            <p className="text-xs text-text-muted">
              Nenhum recebível órfão, vencido sem liquidar ou sem lançamento contábil.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle
                className={errors.length > 0 ? "size-4 text-expense" : "size-4 text-text-muted"}
              />
              Saúde do ledger
            </CardTitle>
            <CardDescription>Furos acionáveis de ingestão e de projeção contábil.</CardDescription>
          </div>
          <Badge tone={errors.length > 0 ? "expense" : "warning"}>
            {formatNumber(issues.length)} {issues.length === 1 ? "alerta" : "alertas"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {issues.map((issue) => {
            const meta = ISSUE_META[issue.issue];
            return (
              <li
                key={`${issue.companyId}-${issue.issue}`}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {meta?.label ?? issue.issue}
                    {meta?.severity === "warn" ? <Badge tone="warning">informativo</Badge> : null}
                  </div>
                  <p className="text-xs text-text-muted">{issue.detail}</p>
                </div>
                <div className="shrink-0 text-right text-sm tabular-nums">
                  {formatNumber(issue.occurrences)}
                  <span className="ml-2 text-xs text-text-muted">{formatBRL(issue.amount)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
