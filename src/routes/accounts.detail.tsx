import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowLeftRight, Pencil, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountBalanceChart } from "@/features/bank-accounts/components/AccountBalanceChart";
import { AccountLedgerTable } from "@/features/bank-accounts/components/AccountLedgerTable";
import { AccountPeriodCards } from "@/features/bank-accounts/components/AccountPeriodCards";
import { TransferDrawer } from "@/features/bank-accounts/components/TransferDrawer";
import { toBalanceSeries } from "@/features/bank-accounts/compute";
import { useAccountLedger, useAccountPeriod, useBankAccount } from "@/features/bank-accounts/hooks";
import { periodPresets, useAccountFilters } from "@/features/bank-accounts/useAccountFilters";
import { formatDate } from "@/lib/dates";

const TYPE_LABELS: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cdb_automatic: "CDB Resgate Automático",
  cdb_daily: "CDB Liquidação diária",
  cdb_term: "CDB",
  investment_fund: "Fundo",
  cash: "Caixa",
};

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [{ from, to }, setFilters] = useAccountFilters();

  const account = useBankAccount(id);
  const period = useAccountPeriod(id, from, to);
  const ledger = useAccountLedger(id, from, to);

  const presets = periodPresets();
  const [transferOpen, setTransferOpen] = React.useState(false);

  // A série do gráfico sai do próprio extrato — sem consulta extra.
  const series = React.useMemo(
    () => toBalanceSeries(ledger.data ?? [], period.data?.opening_balance ?? 0, from),
    [ledger.data, period.data?.opening_balance, from],
  );

  if (account.isLoading) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!account.data) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] p-6 lg:p-8">
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-10 text-center text-sm text-text-muted">
          Conta não encontrada.
          <Link to="/contas" className="mt-2 block text-accent hover:underline">
            Voltar para contas
          </Link>
        </div>
      </div>
    );
  }

  const acc = account.data;

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div>
        <Link
          to="/contas"
          className="text-2xs inline-flex items-center gap-1.5 font-medium tracking-wide text-text-subtle uppercase hover:text-accent"
        >
          <ArrowLeft className="size-3" />
          Contas
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{acc.nickname}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-muted">
              <span>
                {acc.bank_name} · {TYPE_LABELS[acc.account_type] ?? acc.account_type}
              </span>
              {acc.agency && <span>Ag. {acc.agency}</span>}
              {acc.account_number && <span>C/C {acc.account_number}</span>}
              {!acc.is_active && <Badge tone="warning">Inativa</Badge>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" asChild>
              <Link to="/settings/banks">
                <Pencil className="size-4" /> Editar conta
              </Link>
            </Button>
            <Button onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight className="size-4" /> Transferir
            </Button>
          </div>
        </div>
      </div>

      {acc.initial_balance_date === null && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-warning/40 bg-warning/5 p-3.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <span className="font-medium">Sem saldo inicial cadastrado.</span>{" "}
            <span className="text-text-muted">
              O saldo abaixo é a soma de todos os lançamentos, partindo de zero. Cadastre o saldo
              inicial e a data para refletir o extrato real.
            </span>
          </div>
        </div>
      )}

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">De</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => void setFilters({ from: e.target.value })}
              className="w-[160px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">Até</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => void setFilters({ to: e.target.value })}
              className="w-[160px]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            {presets.map((p) => (
              <Button
                key={p.label}
                variant={from === p.from && to === p.to ? "primary" : "ghost"}
                size="sm"
                onClick={() => void setFilters({ from: p.from, to: p.to })}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <AccountPeriodCards data={period.data} loading={period.isLoading} from={from} to={to} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">Evolução do saldo</h2>
        <AccountBalanceChart data={series} loading={ledger.isLoading || period.isLoading} />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Extrato</h2>
          <span className="text-2xs text-text-subtle">
            Lançamentos liquidados entre {formatDate(from)} e {formatDate(to)}
          </span>
        </div>
        <AccountLedgerTable
          data={ledger.data}
          loading={ledger.isLoading}
          openingBalance={period.data?.opening_balance}
          from={from}
        />
      </div>

      <TransferDrawer
        open={transferOpen}
        onOpenChange={setTransferOpen}
        companyId={acc.company_id}
        defaultFromAccountId={acc.id}
      />
    </div>
  );
}
