import * as React from "react";
import { AlertTriangle, Globe2, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { applyScenario, type ForecastDay, type Scenario } from "@/features/forecast/api";
import { ForecastChart } from "@/features/forecast/components/ForecastChart";
import { useForecast } from "@/features/forecast/hooks";
import { cn } from "@/lib/cn";
import { formatDate, isoDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

type Horizon = "30" | "60" | "90" | "180";

const SCENARIO_META: Record<
  Scenario,
  { label: string; description: string; tone: "info" | "expense" | "income" }
> = {
  realistic: { label: "Realista", description: "AP e AR nas datas atuais", tone: "info" },
  pessimistic: {
    label: "Pessimista",
    description: "AR atrasa 7 dias, AP antecipa 3 dias",
    tone: "expense",
  },
  optimistic: { label: "Otimista", description: "AR antecipa 3 dias", tone: "income" },
};

export default function ForecastPage() {
  const { isConsolidated, selectedCompany, selectedCompanyId } = useCompanyScope();
  const [horizon, setHorizon] = React.useState<Horizon>("90");
  const [scenario, setScenario] = React.useState<Scenario>("realistic");

  const from = isoDate(new Date());
  const to = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + Number(horizon));
    return isoDate(d);
  }, [horizon]);

  const { data: baseline = [], isLoading } = useForecast(selectedCompanyId, from, to);
  const series = React.useMemo(() => applyScenario(baseline, scenario), [baseline, scenario]);

  if (isConsolidated || !selectedCompanyId) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
        <Header isConsolidated />
        <Card>
          <CardContent className="p-6 text-center text-sm text-text-muted">
            Selecione uma empresa específica no seletor superior para projetar o fluxo de caixa.
          </CardContent>
        </Card>
      </div>
    );
  }

  const opening = series[0]
    ? series[0].runningBalance -
      (series[0].inflowExpected +
        series[0].inflowRecurring -
        series[0].outflowExpected -
        series[0].outflowRecurring)
    : 0;
  const closing = series.at(-1)?.runningBalance ?? opening;
  const minBalance = series.reduce(
    (acc, d) => (d.runningBalance < acc.runningBalance ? d : acc),
    series[0] ?? null,
  );
  const totalIn = series.reduce((a, d) => a + d.inflowExpected + d.inflowRecurring, 0);
  const totalOut = series.reduce((a, d) => a + d.outflowExpected + d.outflowRecurring, 0);

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <Header companyName={selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—"} />

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="horizon">Horizonte</Label>
            <Select value={horizon} onValueChange={(v) => setHorizon(v as Horizon)}>
              <SelectTrigger id="horizon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Próximos 30 dias</SelectItem>
                <SelectItem value="60">Próximos 60 dias</SelectItem>
                <SelectItem value="90">Próximos 90 dias</SelectItem>
                <SelectItem value="180">Próximos 180 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scenario">Cenário</Label>
            <Select value={scenario} onValueChange={(v) => setScenario(v as Scenario)}>
              <SelectTrigger id="scenario">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="realistic">Realista</SelectItem>
                <SelectItem value="optimistic">Otimista</SelectItem>
                <SelectItem value="pessimistic">Pessimista</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-2xs text-text-subtle">{SCENARIO_META[scenario].description}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi label="Saldo atual" value={opening} loading={isLoading} tone="info" />
        <Kpi label="Entradas previstas" value={totalIn} loading={isLoading} tone="income" />
        <Kpi label="Saídas previstas" value={totalOut} loading={isLoading} tone="expense" />
        <Kpi
          label="Saldo projetado"
          value={closing}
          loading={isLoading}
          tone={closing < 0 ? "expense" : "income"}
        />
      </div>

      {!isLoading && minBalance && minBalance.runningBalance < 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-expense bg-expense-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-expense" />
          <div>
            <strong className="text-expense">Alerta de caixa negativo</strong>
            <p className="mt-0.5 text-text-muted">
              No cenário {SCENARIO_META[scenario].label.toLowerCase()}, o saldo cruza zero em{" "}
              <strong>{formatDate(minBalance.day)}</strong> chegando a{" "}
              <span className="font-mono font-semibold">
                {formatBRL(minBalance.runningBalance)}
              </span>
              .
            </p>
          </div>
        </div>
      )}

      <ForecastChart data={series} loading={isLoading} />

      <ForecastTable data={series} loading={isLoading} />
    </div>
  );
}

interface KpiProps {
  label: string;
  value: number;
  loading: boolean;
  tone: "income" | "expense" | "info";
}

function Kpi({ label, value, loading, tone }: KpiProps) {
  const toneClass = {
    income: "text-income",
    expense: "text-expense",
    info: "text-info",
  }[tone];
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4">
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <div className={cn("font-mono text-2xl font-semibold tracking-tight", toneClass)}>
            {formatBRL(value)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TableProps {
  data: ForecastDay[];
  loading: boolean;
}

function ForecastTable({ data, loading }: TableProps) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (data.length === 0) return null;

  // Show only days with movement, plus key dates (negative balance crossings)
  const interesting = data.filter(
    (d) =>
      d.inflowExpected !== 0 ||
      d.outflowExpected !== 0 ||
      d.inflowRecurring !== 0 ||
      d.outflowRecurring !== 0,
  );

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2">
          <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            <th className="px-3 py-2.5 text-left">Data</th>
            <th className="px-3 py-2.5 text-right">Entradas</th>
            <th className="px-3 py-2.5 text-right">Saídas</th>
            <th className="px-3 py-2.5 text-right">Recorrências</th>
            <th className="px-3 py-2.5 text-right">Saldo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {interesting.slice(0, 60).map((d) => {
            const recurringNet = d.inflowRecurring - d.outflowRecurring;
            return (
              <tr key={d.day} className="hover:bg-surface-2/60">
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                  {formatDate(d.day)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-income">
                  {d.inflowExpected > 0 ? formatBRL(d.inflowExpected) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-expense">
                  {d.outflowExpected > 0 ? formatBRL(d.outflowExpected) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
                  {recurringNet !== 0 ? formatBRL(recurringNet) : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono text-xs font-semibold",
                    d.runningBalance < 0 ? "text-expense" : "text-text",
                  )}
                >
                  {formatBRL(d.runningBalance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {interesting.length > 60 && (
        <div className="px-3 py-2 text-center text-xs text-text-subtle">
          Mostrando 60 de {interesting.length} dias com movimento
        </div>
      )}
    </div>
  );
}

function Header({
  isConsolidated,
  companyName,
}: {
  isConsolidated?: boolean;
  companyName?: string;
}) {
  return (
    <div>
      <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
        {isConsolidated ? (
          <Globe2 className="size-3 text-accent" />
        ) : (
          <TrendingUp className="size-3 text-accent" />
        )}
        Forecast de Caixa
      </div>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
        {isConsolidated ? "Consolidado" : companyName}
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        Projeção combinando saldo atual, contas a pagar/receber pendentes e recorrências ativas.
      </p>
      <div className="mt-2">
        <Badge tone="info">Regime de caixa</Badge>
      </div>
    </div>
  );
}
