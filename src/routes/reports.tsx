import * as React from "react";
import { BarChart3, Building2, Users, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import type { CounterpartyKindFilter } from "@/features/reports/api";
import { CostCenterReport } from "@/features/reports/components/CostCenterReport";
import { CounterpartyReport } from "@/features/reports/components/CounterpartyReport";
import { DreComparisonReport } from "@/features/reports/components/DreComparisonReport";
import { cn } from "@/lib/cn";
import { formatMonthYear } from "@/lib/dates";

type Tab = "cost-center" | "counterparty" | "dre-comparison";

const TABS: { value: Tab; label: string; icon: LucideIcon }[] = [
  { value: "cost-center", label: "Centros de Custo", icon: Building2 },
  { value: "counterparty", label: "Contrapartes", icon: Users },
  { value: "dre-comparison", label: "DRE Comparativo", icon: BarChart3 },
];

type Preset = "current_month" | "last_month" | "ytd" | "last_12m";

function periodFor(preset: Preset): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  switch (preset) {
    case "current_month":
      return {
        from: iso(new Date(y, m, 1)),
        to: iso(new Date(y, m + 1, 0)),
        label: formatMonthYear(new Date(y, m, 1)),
      };
    case "last_month":
      return {
        from: iso(new Date(y, m - 1, 1)),
        to: iso(new Date(y, m, 0)),
        label: formatMonthYear(new Date(y, m - 1, 1)),
      };
    case "ytd":
      return { from: iso(new Date(y, 0, 1)), to: iso(now), label: `${y} (YTD)` };
    case "last_12m": {
      const start = new Date(y, m - 11, 1);
      return { from: iso(start), to: iso(now), label: "Últimos 12 meses" };
    }
  }
}

type Comparison = "mom" | "yoy";

function comparisonPeriods(cmp: Comparison): {
  a: { from: string; to: string; label: string };
  b: { from: string; to: string; label: string };
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (cmp === "mom") {
    return {
      a: {
        from: iso(new Date(y, m - 1, 1)),
        to: iso(new Date(y, m, 0)),
        label: formatMonthYear(new Date(y, m - 1, 1)),
      },
      b: {
        from: iso(new Date(y, m - 2, 1)),
        to: iso(new Date(y, m - 1, 0)),
        label: formatMonthYear(new Date(y, m - 2, 1)),
      },
    };
  }
  // YoY: previous month this year vs previous month last year
  return {
    a: {
      from: iso(new Date(y, m - 1, 1)),
      to: iso(new Date(y, m, 0)),
      label: formatMonthYear(new Date(y, m - 1, 1)),
    },
    b: {
      from: iso(new Date(y - 1, m - 1, 1)),
      to: iso(new Date(y - 1, m, 0)),
      label: formatMonthYear(new Date(y - 1, m - 1, 1)),
    },
  };
}

export default function ReportsPage() {
  const { isConsolidated, selectedCompany, selectedCompanyId } = useCompanyScope();
  const [tab, setTab] = React.useState<Tab>("cost-center");
  const [preset, setPreset] = React.useState<Preset>("current_month");
  const [kind, setKind] = React.useState<CounterpartyKindFilter>("all");
  const [comparison, setComparison] = React.useState<Comparison>("mom");

  if (isConsolidated || !selectedCompanyId) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
        <Header isConsolidated />
        <Card>
          <CardContent className="p-6 text-center text-sm text-text-muted">
            Selecione uma empresa específica no seletor superior para acessar os relatórios.
          </CardContent>
        </Card>
      </div>
    );
  }

  const companyName = selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—";
  const period = periodFor(preset);
  const cmp = comparisonPeriods(comparison);

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <Header companyName={companyName} />

      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <TabButton key={t.value} active={tab === t.value} onClick={() => setTab(t.value)}>
            <t.icon className="size-3.5" /> {t.label}
          </TabButton>
        ))}
      </div>

      {tab === "dre-comparison" ? (
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="cmp">Comparação</Label>
          <Select value={comparison} onValueChange={(v) => setComparison(v as Comparison)}>
            <SelectTrigger id="cmp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mom">Mês a mês (MoM)</SelectItem>
              <SelectItem value="yoy">Ano a ano (YoY)</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-2xs text-text-subtle">
            {cmp.a.label} vs {cmp.b.label}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="period">Período</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger id="period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_month">Mês atual</SelectItem>
              <SelectItem value="last_month">Mês anterior</SelectItem>
              <SelectItem value="ytd">Ano até hoje</SelectItem>
              <SelectItem value="last_12m">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-2xs text-text-subtle">{period.label}</span>
        </div>
      )}

      {tab === "cost-center" && (
        <CostCenterReport companyId={selectedCompanyId} from={period.from} to={period.to} />
      )}
      {tab === "counterparty" && (
        <CounterpartyReport
          companyId={selectedCompanyId}
          from={period.from}
          to={period.to}
          kind={kind}
          onKindChange={setKind}
        />
      )}
      {tab === "dre-comparison" && (
        <DreComparisonReport
          companyId={selectedCompanyId}
          aFrom={cmp.a.from}
          aTo={cmp.a.to}
          bFrom={cmp.b.from}
          bTo={cmp.b.to}
          labelA={cmp.a.label}
          labelB={cmp.b.label}
        />
      )}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text",
      )}
    >
      {children}
    </button>
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
      <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
        Relatórios Gerenciais
      </div>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
        {isConsolidated ? "Consolidado" : companyName}
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        Análises por centro de custo, contraparte e comparativos de DRE (MoM/YoY) — todas
        exportáveis para CSV.
      </p>
    </div>
  );
}
