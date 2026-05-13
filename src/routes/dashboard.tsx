import { ArrowDownRight, ArrowUpRight, Building2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { cn } from "@/lib/cn";
import { formatBRL, formatPercent } from "@/lib/format";

export default function DashboardPage() {
  const { isConsolidated, selectedCompany, companies, loading } = useCompanyScope();
  const operational = companies.filter((c) => !c.is_holding);

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-6 p-6 lg:p-8">
      {/* Header */}
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
              ? `Agregando ${operational.length} empresas operacionais.`
              : "Operação individual"}
          </p>
        </div>
        <Badge tone="info">YTD · 2026</Badge>
      </div>

      {/* Bento KPI grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:auto-rows-[140px] lg:grid-cols-6">
        {/* Receita Bruta — destaque */}
        <Card className="surface-gradient-brand relative overflow-hidden border-0 text-white shadow-[var(--shadow-accent)] lg:col-span-3 lg:row-span-2">
          <div className="bento-mesh pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay" />
          <CardHeader className="relative">
            <CardTitle className="text-white/80">Venda Bruta · YTD</CardTitle>
          </CardHeader>
          <CardContent className="relative space-y-3">
            <div className="font-mono text-4xl font-semibold tracking-tight">{formatBRL(0)}</div>
            <div className="flex items-center gap-1.5 text-xs">
              <ArrowUpRight className="size-3.5" />
              <span className="font-medium">+0,0%</span>
              <span className="text-white/70">vs ano anterior</span>
            </div>
            <p className="text-2xs pt-6 text-white/60">
              Sem lançamentos ainda — popular via importação CSV ou cadastro manual.
            </p>
          </CardContent>
        </Card>

        <KpiCard
          label="Lucro Líquido"
          value={formatBRL(0)}
          sub="Margem Líquida 0,0%"
          tone="income"
        />
        <KpiCard
          label="Despesas Totais"
          value={formatBRL(0)}
          sub="0,0% da receita"
          tone="expense"
        />
        <KpiCard label="Geração de Caixa" value={formatBRL(0)} sub="Mês atual" tone="info" />
        <KpiCard
          label="Alíquota Efetiva"
          value={formatPercent(0)}
          sub="Tributos / Receita"
          tone="warning"
        />
      </div>

      {/* Empresas grid (consolidado) */}
      {isConsolidated && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Empresas do grupo</h2>
            <Badge>{operational.length} ativas</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)
              : operational.map((c) => (
                  <Card key={c.id} className="group transition-colors hover:border-accent/40">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-start justify-between">
                        <div className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-accent-soft text-accent transition-transform group-hover:scale-110">
                          <Building2 className="size-4" />
                        </div>
                        <Badge tone="default">{c.tax_regime.replace("_", " ")}</Badge>
                      </div>
                      <div>
                        <div className="text-sm font-medium">{c.trade_name ?? c.legal_name}</div>
                        {c.trade_name && c.legal_name !== c.trade_name && (
                          <div className="text-2xs truncate text-text-subtle">{c.legal_name}</div>
                        )}
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-1">
                        <span className="text-2xs text-text-subtle">Receita YTD</span>
                        <span className="font-mono text-sm font-medium">{formatBRL(0)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>
        </section>
      )}

      {/* Próximos passos */}
      <Card className="border-dashed">
        <CardContent className="space-y-2 p-6">
          <h3 className="font-semibold">Próximos passos para popular o dashboard</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-text-muted">
            <li className="flex gap-2">
              <span className="text-accent">→</span> Cadastrar contas bancárias com saldo inicial
            </li>
            <li className="flex gap-2">
              <span className="text-accent">→</span> Importar planilha histórica (CSV/XLSX)
            </li>
            <li className="flex gap-2">
              <span className="text-accent">→</span> Configurar lançamentos recorrentes (aluguel,
              salários)
            </li>
            <li className="flex gap-2">
              <span className="text-accent">→</span> Lançar folha de pagamento do mês corrente
            </li>
          </ul>
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
}

function KpiCard({ label, value, sub, tone = "accent" }: KpiCardProps) {
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
        <div className="font-mono text-2xl font-semibold tracking-tight">{value}</div>
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
