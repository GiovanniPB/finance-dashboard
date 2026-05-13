import { Landmark } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";

import type { BankAccountBalance } from "../types";

interface Props {
  data: BankAccountBalance[] | undefined;
  loading: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cdb_automatic: "CDB Resgate Automático",
  cdb_daily: "CDB Liquidação diária",
  cdb_term: "CDB",
  investment_fund: "Fundo",
  cash: "Caixa",
};

export function BankBalancesCard({ data, loading }: Props) {
  const total = data?.reduce((acc, b) => acc + b.closing_balance, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Landmark className="size-4 text-accent" />
          Saldos por conta
        </CardTitle>
        {!loading && data && (
          <span className="font-mono text-sm font-semibold text-text tabular-nums">
            Total: {formatBRL(total)}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nenhuma conta bancária cadastrada nesta empresa.
          </p>
        ) : (
          data.map((b) => (
            <div
              key={b.bank_account_id}
              className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface-2/40 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{b.nickname}</div>
                <div className="text-2xs text-text-subtle">
                  {b.bank_name} · {TYPE_LABELS[b.account_type] ?? b.account_type}
                </div>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatBRL(b.closing_balance)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
