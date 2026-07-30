import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Globe2, Landmark, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TransferDrawer } from "@/features/bank-accounts/components/TransferDrawer";
import { useBalancesMulti, useUnassignedCount } from "@/features/bank-accounts/hooks";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { NO_BANK_ACCOUNT } from "@/features/transactions/types";
import { cn } from "@/lib/cn";
import { isoDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cdb_automatic: "CDB Resgate Automático",
  cdb_daily: "CDB Liquidação diária",
  cdb_term: "CDB",
  investment_fund: "Fundo",
  cash: "Caixa",
};

export default function AccountsPage() {
  const { selectedCompanyId, isConsolidated } = useCompanyScope();
  const today = isoDate(new Date());

  // Consolidado busca todas as empresas acessíveis (a RLS faz o recorte).
  const companyIds = isConsolidated ? null : selectedCompanyId ? [selectedCompanyId] : null;
  const { data, isLoading } = useBalancesMulti(today, companyIds);
  const unassigned = useUnassignedCount(companyIds);
  const [transferOpen, setTransferOpen] = React.useState(false);

  const total = data?.reduce((acc, a) => acc + a.closing_balance, 0) ?? 0;

  // No consolidado agrupamos por empresa; fora dele é uma lista só.
  const groups = new Map<string, typeof data>();
  for (const account of data ?? []) {
    const key = account.company_name;
    groups.set(key, [...(groups.get(key) ?? []), account]);
  }

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            {isConsolidated ? <Globe2 className="size-3 text-accent" /> : null}
            Contas
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            Contas bancárias
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Saldo de cada conta hoje,{" "}
            {isConsolidated ? "somando todas as empresas" : "nesta empresa"}. Clique numa conta para
            ver o extrato.
          </p>
        </div>
        <div className="flex items-end gap-4">
          {!isLoading && data && data.length > 0 && (
            <div className="text-right">
              <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                Total disponível
              </div>
              <div
                className={cn(
                  "font-mono text-2xl font-semibold tabular-nums",
                  total < 0 ? "text-expense" : "text-accent",
                )}
              >
                {formatBRL(total)}
              </div>
            </div>
          )}
          {/* Transferir exige uma empresa definida: as duas contas têm que ser dela. */}
          {!isConsolidated && selectedCompanyId && (
            <Button onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight className="size-4" /> Transferir
            </Button>
          )}
        </div>
      </div>

      {(unassigned.data ?? 0) > 0 && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-[var(--radius-lg)] border border-warning/40 bg-warning/5 p-3.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="flex-1">
            <span className="font-medium">
              {unassigned.data} lançamentos liquidados sem conta bancária.
            </span>{" "}
            <span className="text-text-muted">
              Eles não entram no saldo de nenhuma conta, então a soma acima fica menor que o caixa
              real.
            </span>
          </div>
          <Link
            to={`/transactions?bankAccountId=${NO_BANK_ACCOUNT}&status=settled`}
            className="font-medium text-accent hover:underline"
          >
            Revisar
          </Link>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[124px] w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-10 text-center">
          <Landmark className="mx-auto size-6 text-text-subtle" />
          <p className="mt-3 text-sm text-text-muted">Nenhuma conta bancária ativa.</p>
          <Link
            to="/settings/banks"
            className="mt-2 inline-block text-sm text-accent hover:underline"
          >
            Cadastrar conta
          </Link>
        </div>
      ) : (
        Array.from(groups.entries()).map(([companyName, accounts]) => (
          <section key={companyName} className="space-y-3">
            {isConsolidated && (
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight">{companyName}</h2>
                <span className="font-mono text-xs text-text-subtle tabular-nums">
                  {formatBRL((accounts ?? []).reduce((a, b) => a + b.closing_balance, 0))}
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(accounts ?? []).map((a) => (
                <Link
                  key={a.bank_account_id}
                  to={`/contas/${a.bank_account_id}`}
                  className="group rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-accent/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium group-hover:text-accent">
                        {a.nickname}
                      </div>
                      <div className="text-2xs text-text-subtle">
                        {a.bank_name} · {TYPE_LABELS[a.account_type] ?? a.account_type}
                      </div>
                    </div>
                    <Landmark className="size-4 shrink-0 text-text-subtle" />
                  </div>

                  <div
                    className={cn(
                      "mt-3 font-mono text-xl font-semibold tabular-nums",
                      a.closing_balance < 0 ? "text-expense" : "text-text",
                    )}
                  >
                    {formatBRL(a.closing_balance)}
                  </div>

                  <div className="text-2xs mt-2 flex items-center gap-2 font-mono text-text-subtle tabular-nums">
                    <span className="text-income">+{formatBRL(a.inflow)}</span>
                    <span className="text-expense">−{formatBRL(a.outflow)}</span>
                  </div>

                  {a.initial_balance === 0 && (
                    <div className="text-2xs mt-2 flex items-center gap-1.5 text-text-subtle">
                      <TriangleAlert className="size-3" />
                      Sem saldo inicial cadastrado
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}

      {!isLoading && data && data.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Badge>{data.length} contas</Badge>
          <span>
            Saldo = inicial + lançamentos liquidados até hoje.{" "}
            <Link to="/settings/banks" className="text-accent hover:underline">
              Gerenciar contas
            </Link>
          </span>
        </div>
      )}

      {!isConsolidated && selectedCompanyId && (
        <TransferDrawer
          open={transferOpen}
          onOpenChange={setTransferOpen}
          companyId={selectedCompanyId}
        />
      )}
    </div>
  );
}
