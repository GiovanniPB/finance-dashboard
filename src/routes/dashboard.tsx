import { Suspense, useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Building2, Sparkles } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useExpenseBreakdown, useKpiDashboard, useKpiDashboardConsolidated } from "@/features/kpis";
import {
  ExpenseDonut,
  HeroRevenueChart,
  RevenueVsResultChart,
} from "@/features/kpis/components/lazy";
import { cn } from "@/lib/cn";
import { formatMonthYear } from "@/lib/dates";
import { formatBRL, formatPercent } from "@/lib/format";

const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

export default function DashboardPage() {
  const { isConsolidated, selectedCompany, companies, loading } = useCompanyScope();
  const operational = companies.filter((c) => !c.is_holding);

  const [year, setYear] = useQueryState("year", parseAsInteger.withDefault(2025));

  const companyId = isConsolidated ? null : (selectedCompany?.id ?? null);

  const perCompany = useKpiDashboard(companyId, year);
  const consolidated = useKpiDashboardConsolidated(isConsolidated ? ORGANIZATION_ID : null, year);
  const kpis = isConsolidated ? consolidated.data : perCompany.data;
  const kpisLoading = isConsolidated ? consolidated.isLoading : perCompany.isLoading;

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
          <CardContent>
            {chartData.length === 0 && showSkeleton ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <div className="h-[260px]">
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <RevenueVsResultChart data={chartData} />
                </Suspense>
              </div>
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
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-text-muted">Sem despesas no período.</p>
            )}
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
