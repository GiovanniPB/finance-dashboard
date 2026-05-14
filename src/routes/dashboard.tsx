import { Suspense, useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Building2, Sparkles } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightCallout } from "@/components/ui/insight-callout";
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
import { useExpenseBreakdown, useKpiYoY } from "@/features/kpis";
import {
  ExpenseDonut,
  HeroRevenueChart,
  RevenueVsResultChart,
  YoYAreaChart,
  YoYBarChart,
} from "@/features/kpis/components/lazy";
import { cn } from "@/lib/cn";
import { formatMonthYear } from "@/lib/dates";
import { formatBRL, formatPercent } from "@/lib/format";
import { buildExpenseInsight, buildMarginInsight, buildYoYInsight } from "@/lib/insights";

const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

export default function DashboardPage() {
  const { isConsolidated, selectedCompany, companies, loading } = useCompanyScope();
  const operational = companies.filter((c) => !c.is_holding);

  const [year, setYear] = useQueryState("year", parseAsInteger.withDefault(2025));

  const companyId = isConsolidated ? null : (selectedCompany?.id ?? null);

  const {
    current: kpis,
    previous: kpisPrev,
    isLoading: kpisLoading,
  } = useKpiYoY({
    companyId,
    organizationId: ORGANIZATION_ID,
    year,
    consolidated: isConsolidated,
  });

  const expenses = useExpenseBreakdown({
    companyId,
    organizationId: isConsolidated ? ORGANIZATION_ID : null,
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  });

  const ytd = kpis?.ytd;

  const chartData = useMemo(
    () =>
      (kpis?.monthly ?? []).map((m) => ({
        month: formatMonthYear(m.month_start).split(" ")[0] ?? "",
        receita: m.gross_revenue,
        liquido: m.net_revenue,
        resultado: m.net_result,
      })),
    [kpis?.monthly],
  );

  /** YoY data: merge current + previous monthly arrays by month index (0-11). */
  const yoyData = useMemo(() => {
    const months = [
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ];
    const cur = kpis?.monthly ?? [];
    const prev = kpisPrev?.monthly ?? [];
    const byIdx = (arr: typeof cur, i: number) => {
      return arr.find((m) => Number(m.month_start.slice(5, 7)) === i + 1);
    };
    return months
      .map((label, i) => ({
        label,
        idx: i,
        currentRow: byIdx(cur, i),
        previousRow: byIdx(prev, i),
      }))
      .filter((row) => row.currentRow != null || row.previousRow != null);
  }, [kpis?.monthly, kpisPrev?.monthly]);

  const grossYoY = useMemo(
    () =>
      yoyData.map((r) => ({
        month: r.label,
        current: r.currentRow?.gross_revenue ?? 0,
        previous: r.previousRow?.gross_revenue ?? 0,
      })),
    [yoyData],
  );

  const grossYoYAcc = useMemo(() => {
    let curAcc = 0;
    let prevAcc = 0;
    return yoyData.map((r) => {
      curAcc += r.currentRow?.gross_revenue ?? 0;
      prevAcc += r.previousRow?.gross_revenue ?? 0;
      return { month: r.label, current: curAcc, previous: prevAcc };
    });
  }, [yoyData]);

  const grossInsight = useMemo(
    () =>
      buildYoYInsight(
        {
          current: (kpis?.monthly ?? []).map((m) => ({
            month_start: m.month_start,
            value: m.gross_revenue,
          })),
          previous: (kpisPrev?.monthly ?? []).map((m) => ({
            month_start: m.month_start,
            value: m.gross_revenue,
          })),
        },
        "Receita bruta",
      ),
    [kpis?.monthly, kpisPrev?.monthly],
  );

  const profitInsight = useMemo(
    () =>
      buildYoYInsight(
        {
          current: (kpis?.monthly ?? []).map((m) => ({
            month_start: m.month_start,
            value: m.net_result,
          })),
          previous: (kpisPrev?.monthly ?? []).map((m) => ({
            month_start: m.month_start,
            value: m.net_result,
          })),
        },
        "Lucro líquido",
      ),
    [kpis?.monthly, kpisPrev?.monthly],
  );

  const marginInsight = useMemo(() => {
    if (!kpis?.ytd) return null;
    return buildMarginInsight({
      current: (kpis.monthly ?? []).map((m) => ({
        month_start: m.month_start,
        gross_margin_pct: m.gross_margin_pct,
        net_margin_pct: m.net_margin_pct,
      })),
      ytdGross: kpis.ytd.gross_margin_pct,
      ytdNet: kpis.ytd.net_margin_pct,
      previousYtdGross: kpisPrev?.ytd.gross_margin_pct ?? null,
      previousYtdNet: kpisPrev?.ytd.net_margin_pct ?? null,
    });
  }, [kpis, kpisPrev]);

  const expenseInsight = useMemo(
    () => (expenses.data ? buildExpenseInsight(expenses.data) : null),
    [expenses.data],
  );

  const showSkeleton = kpisLoading || !ytd;

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            <Sparkles className="size-3 text-accent" />
            {isConsolidated ? "Visão de grupo" : "Empresa"}
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-balance">
            {isConsolidated
              ? "Consolidado · OTM Group"
              : (selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {isConsolidated
              ? `Agregando ${operational.length} empresas operacionais`
              : "Operação individual"}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="year">Ano</Label>
            <Select value={String(year)} onValueChange={(v) => void setYear(Number(v))}>
              <SelectTrigger id="year" className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge tone="info">YTD · {year}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:auto-rows-[140px] lg:grid-cols-6">
        <Card className="surface-gradient-brand relative overflow-hidden border-0 text-white shadow-[var(--shadow-accent)] lg:col-span-3 lg:row-span-2">
          <div className="bento-mesh pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay" />
          <CardHeader className="relative">
            <CardTitle className="text-white/80">Venda Bruta · YTD {year}</CardTitle>
          </CardHeader>
          <CardContent className="relative space-y-3">
            <div className="font-mono text-4xl font-semibold tracking-tight">
              {showSkeleton ? (
                <Skeleton className="h-10 w-48 bg-white/20" />
              ) : (
                formatBRL(ytd.gross_revenue)
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <ArrowUpRight className="size-3.5" />
              <span className="font-medium">
                {ytd ? formatPercent(ytd.effective_tax_rate_pct / 100) : "—"}
              </span>
              <span className="text-white/70">alíquota efetiva</span>
            </div>
            <div className="-mx-2 h-[120px] pt-4">
              {chartData.length > 0 && (
                <Suspense fallback={<Skeleton className="h-full w-full bg-white/10" />}>
                  <HeroRevenueChart data={chartData} />
                </Suspense>
              )}
            </div>
          </CardContent>
        </Card>

        <KpiCard
          label="Lucro Líquido YTD"
          value={ytd ? formatBRL(ytd.net_result) : "—"}
          sub={ytd ? `Margem ${formatPercent(ytd.net_margin_pct / 100)}` : ""}
          tone={ytd && ytd.net_result < 0 ? "expense" : "income"}
          loading={showSkeleton}
        />
        <KpiCard
          label="Custos Fixos"
          value={ytd ? formatBRL(ytd.fixed_costs) : "—"}
          sub={
            ytd?.gross_revenue
              ? `${formatPercent(ytd.fixed_costs / ytd.gross_revenue)} da receita`
              : ""
          }
          tone="expense"
          loading={showSkeleton}
        />
        <KpiCard
          label="Geração de Caixa"
          value={ytd ? formatBRL(ytd.cash_generation) : "—"}
          sub={`YTD ${year}`}
          tone={ytd && ytd.cash_generation < 0 ? "warning" : "info"}
          loading={showSkeleton}
        />
        <KpiCard
          label="Margem Bruta"
          value={ytd ? formatPercent(ytd.gross_margin_pct / 100) : "—"}
          sub={ytd ? `${formatBRL(ytd.net_revenue - ytd.cogs)} líquido` : ""}
          tone="accent"
          loading={showSkeleton}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receita & Resultado · {year}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {chartData.length === 0 && showSkeleton ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <div className="h-[260px]">
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <RevenueVsResultChart data={chartData} />
                </Suspense>
              </div>
            )}
            {marginInsight && (
              <InsightCallout direction={marginInsight.direction}>
                {marginInsight.message}
              </InsightCallout>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : expenses.data && expenses.data.length > 0 ? (
              <div className="space-y-3">
                <div className="h-[200px]">
                  <Suspense fallback={<Skeleton className="h-full w-full" />}>
                    <ExpenseDonut data={expenses.data} />
                  </Suspense>
                </div>
                <ul className="space-y-1.5 text-xs">
                  {expenses.data.slice(0, 5).map((e) => (
                    <li
                      key={(e.account_id ?? "outros") + e.account_name}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-text-muted">{e.account_name}</span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatBRL(e.total)}
                      </span>
                    </li>
                  ))}
                </ul>
                {expenseInsight && (
                  <InsightCallout tone="info">{expenseInsight.message}</InsightCallout>
                )}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-text-muted">Sem despesas no período.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* YoY comparison section */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              Receita Bruta — {year} vs {year - 1}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {showSkeleton ? (
              <Skeleton className="h-[260px] w-full" />
            ) : grossYoY.length > 0 ? (
              <div className="h-[260px]">
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <YoYBarChart
                    data={grossYoY}
                    currentLabel={String(year)}
                    previousLabel={String(year - 1)}
                  />
                </Suspense>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-text-muted">Sem dados no período.</p>
            )}
            <InsightCallout direction={grossInsight.direction}>
              {grossInsight.message}
            </InsightCallout>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Receita Acumulada — {year} vs {year - 1}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {showSkeleton ? (
              <Skeleton className="h-[260px] w-full" />
            ) : grossYoYAcc.length > 0 ? (
              <div className="h-[260px]">
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <YoYAreaChart
                    data={grossYoYAcc}
                    currentLabel={`${year} acumulado`}
                    previousLabel={`${year - 1} acumulado`}
                    showLegend
                  />
                </Suspense>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-text-muted">Sem dados no período.</p>
            )}
            <InsightCallout tone="info">
              Comparação mês a mês do acumulado: cada ponto representa a soma do início do ano até
              aquele mês.
            </InsightCallout>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>
              Lucro Líquido Mensal — {year} vs {year - 1}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {showSkeleton ? (
              <Skeleton className="h-[260px] w-full" />
            ) : yoyData.length > 0 ? (
              <div className="h-[260px]">
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <YoYBarChart
                    data={yoyData.map((r) => ({
                      month: r.label,
                      current: r.currentRow?.net_result ?? 0,
                      previous: r.previousRow?.net_result ?? 0,
                    }))}
                    currentLabel={String(year)}
                    previousLabel={String(year - 1)}
                    currentColor="oklch(64% 0.18 158)"
                  />
                </Suspense>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-text-muted">Sem dados no período.</p>
            )}
            <InsightCallout direction={profitInsight.direction}>
              {profitInsight.message}
            </InsightCallout>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Empresas do grupo</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)
            : operational.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2/40 px-3 py-2.5"
                >
                  <div className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-accent-soft text-accent">
                    <Building2 className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {c.trade_name ?? c.legal_name}
                    </div>
                    <div className="text-2xs text-text-subtle">
                      {c.tax_regime.replace("_", " ")}
                    </div>
                  </div>
                </div>
              ))}
        </CardContent>
      </Card>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "income" | "expense" | "info" | "warning" | "accent";
  loading?: boolean;
}

function KpiCard({ label, value, sub, tone = "accent", loading }: KpiCardProps) {
  const toneRing = {
    income: "before:bg-income",
    expense: "before:bg-expense",
    info: "before:bg-info",
    warning: "before:bg-warning",
    accent: "before:bg-accent",
  }[tone];

  return (
    <Card
      className={cn(
        "relative overflow-hidden lg:col-span-3",
        "before:absolute before:top-5 before:left-0 before:h-5 before:w-0.5 before:rounded-r-full",
        toneRing,
      )}
    >
      <CardContent className="space-y-2 p-5">
        <CardTitle>{label}</CardTitle>
        {loading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <div className="font-mono text-2xl font-semibold tracking-tight">{value}</div>
        )}
        {sub && (
          <div className="text-2xs flex items-center gap-1 text-text-subtle">
            {tone === "income" ? (
              <ArrowUpRight className="size-3 text-income" />
            ) : tone === "expense" ? (
              <ArrowDownRight className="size-3 text-expense" />
            ) : null}
            {sub}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
