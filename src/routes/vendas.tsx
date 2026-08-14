import { Link } from "react-router-dom";
import { Calendar, Plug } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import type { SalesGrain } from "@/features/sales/api";
import { SalesByBrand } from "@/features/sales/components/breakdown/SalesByBrand";
import { SalesByInstallments } from "@/features/sales/components/breakdown/SalesByInstallments";
import { SalesByPaymentMethod } from "@/features/sales/components/breakdown/SalesByPaymentMethod";
import { SalesByPlan } from "@/features/sales/components/breakdown/SalesByPlan";
import { SalesBySplit } from "@/features/sales/components/breakdown/SalesBySplit";
import { LedgerHealthCard } from "@/features/sales/components/LedgerHealthCard";
import { ReceivablesScheduleChart } from "@/features/sales/components/ReceivablesScheduleChart";
import { RecurrenceCard } from "@/features/sales/components/RecurrenceCard";
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
  const [filters, setFilters] = useSalesFilters();
  const { year, month, grain, account } = filters;

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
  // Uma consulta por dimensão: cada card tem seu próprio recorte e seu próprio
  // gráfico. São cinco leituras leves e paralelas — o custo real era a RLS, já
  // corrigida na migration `rls_initplan_optimization`.
  const byMethod = useSalesBreakdown(range.start, range.end, "payment_method", accountId);
  const byInstallments = useSalesBreakdown(range.start, range.end, "installments", accountId);
  const byBrand = useSalesBreakdown(range.start, range.end, "brand", accountId);
  const byPlan = useSalesBreakdown(range.start, range.end, "plan", accountId);
  const bySplit = useSalesBreakdown(range.start, range.end, "company", accountId);
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
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            Recebíveis por empresa:{" "}
            {isConsolidated
              ? "consolidado"
              : (selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—")}
          </Badge>
          {/* esta tela só LÊ; carga histórica e projeção vivem na integração */}
          <Button variant="outline" size="sm" asChild>
            <Link to="/integracoes">
              <Plug className="size-4" /> Integração
            </Link>
          </Button>
        </div>
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
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <Plug className="size-3.5" />
            Nenhuma conexão pagar.me cadastrada.
            <Button size="sm" variant="link" asChild>
              <Link to="/integracoes">Configurar integração</Link>
            </Button>
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
        <SalesByPaymentMethod data={byMethod.data} loading={byMethod.isLoading} />
        <SalesByBrand data={byBrand.data} loading={byBrand.isLoading} />
      </div>

      {/* largura inteira: 1x…12x precisa de espaço para a sequência ser legível */}
      <SalesByInstallments data={byInstallments.data} loading={byInstallments.isLoading} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SalesByPlan data={byPlan.data} loading={byPlan.isLoading} />
        <SalesBySplit data={bySplit.data} loading={bySplit.isLoading} />
      </div>

      <RecurrenceCard data={recurrence.data} loading={recurrence.isLoading} />
    </div>
  );
}
