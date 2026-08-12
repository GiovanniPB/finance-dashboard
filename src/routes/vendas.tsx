import { Calendar, Plug, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/features/auth/usePermissions";
import { useBankAccounts } from "@/features/bank-accounts/hooks";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import type { SalesGrain } from "@/features/sales/api";
import { BackfillCard } from "@/features/sales/components/BackfillCard";
import { LedgerHealthCard } from "@/features/sales/components/LedgerHealthCard";
import { ProjectionSetupCard } from "@/features/sales/components/ProjectionSetupCard";
import { ReceivablesScheduleChart } from "@/features/sales/components/ReceivablesScheduleChart";
import { RecurrenceCard } from "@/features/sales/components/RecurrenceCard";
import { SalesBreakdownCard } from "@/features/sales/components/SalesBreakdownCard";
import { SalesEvolutionChart } from "@/features/sales/components/SalesEvolutionChart";
import { SalesKpis } from "@/features/sales/components/SalesKpis";
import {
  useLedgerHealth,
  usePagarmeAccounts,
  useReceivablesSchedule,
  useSalesBreakdown,
  useSalesCustomers,
  useSalesOverview,
  useSalesRecurrence,
  useSalesTimeseries,
} from "@/features/sales/hooks";
import { useSalesFilters } from "@/features/sales/useSalesFilters";
import { monthBounds } from "@/lib/dates";

/** Sentinela de "todas as conexões" — ver nota sobre Radix em `accountId`. */
const ALL_ACCOUNTS = "all";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/**
 * Dashboard de vendas do pagar.me.
 *
 * Dois escopos convivem aqui de propósito, porque o domínio tem dois:
 *  · VENDA (KPIs, evolução, composição) é por CONEXÃO pagar.me — a venda pertence
 *    a quem vendeu;
 *  · DINHEIRO (cronograma de recebíveis) é por EMPRESA — pertence a quem recebe o
 *    split. No grupo isso importa: a RCO recebe dentro da conta da Jimmy.
 */
export default function VendasPage() {
  const { selectedCompanyId, selectedCompany, isConsolidated } = useCompanyScope();
  const { canEdit } = usePermissions();
  const { data: bankAccounts } = useBankAccounts(selectedCompanyId);
  const [filters, setFilters] = useSalesFilters();
  const { year, month, grain, dimension, account } = filters;

  const accounts = usePagarmeAccounts();
  // Radix proíbe SelectItem com value="" (é o valor reservado para limpar a
  // seleção), então "todas" precisa de um sentinela explícito.
  const accountId = account === ALL_ACCOUNTS ? null : account;

  const monthSelected = month >= 1 && month <= 12;
  const range = monthSelected
    ? monthBounds(new Date(year, month - 1, 1))
    : { start: `${year}-01-01`, end: `${year}-12-31` };

  // mês específico pede visão diária; ano inteiro pede mensal, senão o gráfico
  // vira 365 barras ilegíveis
  const effectiveGrain: SalesGrain = monthSelected ? grain : grain === "day" ? "month" : grain;

  const overview = useSalesOverview(range.start, range.end, accountId);
  const customers = useSalesCustomers(range.start, range.end, accountId);
  const timeseries = useSalesTimeseries(range.start, range.end, effectiveGrain, accountId);
  const breakdown = useSalesBreakdown(range.start, range.end, dimension, accountId);
  const recurrence = useSalesRecurrence(range.start, range.end, accountId);
  const health = useLedgerHealth();

  // Recebíveis olham para FRENTE: a janela é do início do período até 18 meses à
  // frente, porque é aí que está o dinheiro contratado (venda em 12x).
  const receivablesTo = `${year + 1}-12-31`;
  const receivables = useReceivablesSchedule(
    range.start,
    receivablesTo,
    isConsolidated ? null : selectedCompanyId,
  );

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Vendas · pagar.me
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {account === ALL_ACCOUNTS
              ? "Todas as conexões"
              : (accounts.data?.find((a) => a.id === account)?.label ?? "—")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Evolução, composição e recebíveis contratados — direto do pagar.me.
          </p>
        </div>
        <Badge tone="accent">
          Recebíveis por empresa:{" "}
          {isConsolidated
            ? "consolidado"
            : (selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—")}
        </Badge>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-text-muted">
          <Calendar className="size-4" />
          <span className="text-xs font-medium tracking-wide uppercase">Período e conexão</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sales-year">Ano</Label>
            <Select
              value={String(year)}
              onValueChange={(v) => void setFilters({ year: Number(v) })}
            >
              <SelectTrigger id="sales-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2025, 2026, 2027].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sales-month">Mês</Label>
            <Select
              value={String(month)}
              onValueChange={(v) => void setFilters({ month: Number(v) })}
            >
              <SelectTrigger id="sales-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Ano inteiro</SelectItem>
                {MONTH_LABELS.map((label, i) => (
                  <SelectItem key={label} value={String(i + 1)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sales-grain">Granularidade</Label>
            <Select
              value={effectiveGrain}
              onValueChange={(v) => void setFilters({ grain: v as SalesGrain })}
            >
              <SelectTrigger id="sales-grain">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day" disabled={!monthSelected}>
                  Diária
                </SelectItem>
                <SelectItem value="week">Semanal</SelectItem>
                <SelectItem value="month">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sales-account">Conexão pagar.me</Label>
            <Select value={account} onValueChange={(v) => void setFilters({ account: v })}>
              <SelectTrigger id="sales-account">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ACCOUNTS}>Todas as conexões</SelectItem>
                {(accounts.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                    {a.ambiente === "homologacao" ? " (homologação)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {accounts.data?.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <Plug className="size-3.5" />
            Nenhuma conexão pagar.me cadastrada. Configure em NFS-e → Conexões.
          </p>
        ) : null}
      </div>

      <LedgerHealthCard data={health.data} loading={health.isLoading} />

      <SalesKpis
        overview={overview.data}
        customers={customers.data}
        loading={overview.isLoading || customers.isLoading}
      />

      <SalesEvolutionChart
        data={timeseries.data}
        loading={timeseries.isLoading}
        grain={effectiveGrain}
      />

      <ReceivablesScheduleChart data={receivables.data} loading={receivables.isLoading} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SalesBreakdownCard
          data={breakdown.data}
          loading={breakdown.isLoading}
          dimension={dimension}
          onDimensionChange={(d) => void setFilters({ dimension: d })}
        />
        <RecurrenceCard data={recurrence.data} loading={recurrence.isLoading} />
      </div>

      {/*
        Operação da esteira. Fica no fim porque é uso pontual — carga histórica e
        configuração da carteira acontecem no go-live e depois raramente. Exige
        empresa selecionada: carteira e projeção são por empresa, e no consolidado
        não há para onde lançar.
      */}
      <div className="space-y-5 border-t border-border pt-5">
        <div className="flex items-center gap-2 text-text-muted">
          <Settings2 className="size-4" />
          <span className="text-xs font-medium tracking-wide uppercase">Operação da esteira</span>
        </div>

        <BackfillCard accounts={accounts.data ?? []} canEdit={canEdit} />

        {selectedCompanyId ? (
          <ProjectionSetupCard
            companyId={selectedCompanyId}
            accounts={accounts.data ?? []}
            bankAccounts={(bankAccounts ?? []).map((b) => ({
              id: b.id,
              nickname: b.nickname,
              accountType: b.account_type,
            }))}
            canEdit={canEdit}
          />
        ) : (
          <p className="text-sm text-text-muted">
            Selecione uma empresa para configurar a carteira do gateway e a projeção.
          </p>
        )}
      </div>
    </div>
  );
}
