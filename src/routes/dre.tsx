import { Download, Globe2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { DreTable } from "@/features/dre/components/DreTable";
import { PeriodPicker } from "@/features/dre/components/PeriodPicker";
import { useDreByCompany, useDreConsolidated } from "@/features/dre/hooks";
import { resolvePreset, usePeriod } from "@/features/dre/usePeriod";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

// OTM Group organization id (seeded). Hard-coded for now — could be derived
// from companies[0].organization_id once we expose it via context.
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

export default function DrePage() {
  const { isConsolidated, selectedCompany, selectedCompanyId } = useCompanyScope();
  const [period] = usePeriod();

  const effective =
    period.preset === "custom"
      ? { from: period.from, to: period.to }
      : resolvePreset(period.preset);

  const companyResult = useDreByCompany(
    isConsolidated ? null : selectedCompanyId,
    effective.from,
    effective.to,
  );
  const consolidatedResult = useDreConsolidated(
    isConsolidated ? ORGANIZATION_ID : null,
    effective.from,
    effective.to,
  );

  const data = isConsolidated ? consolidatedResult.data : companyResult.data;
  const isLoading = isConsolidated ? consolidatedResult.isLoading : companyResult.isLoading;

  // Find the "Resultado Líquido (RL)" row for the highlight card.
  const netResult = data?.find((r) => r.dre_section === "net_result" && r.is_summary);
  const grossRevenue = data?.find((r) => r.dre_section === "gross_revenue" && r.is_summary);

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            {isConsolidated ? <Globe2 className="size-3 text-accent" /> : null}
            DRE · Demonstrativo de Resultado
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {isConsolidated
              ? "Consolidado · OTM Group"
              : (selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {effective.from && effective.to ? (
              <>
                Período: {formatDate(effective.from)} → {formatDate(effective.to)}
              </>
            ) : (
              "Selecione um período"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.length === 0}
            onClick={() => {
              if (!data) return;
              const csv = toCsv(data, [
                { key: "code", header: "Código", getValue: (r) => r.code },
                { key: "name", header: "Conta", getValue: (r) => r.name },
                { key: "kind", header: "Tipo", getValue: (r) => r.kind },
                {
                  key: "total",
                  header: "Total",
                  getValue: (r) => r.effective_total.toFixed(2),
                },
              ]);
              const scope = isConsolidated
                ? "consolidado"
                : (selectedCompany?.trade_name ?? "empresa");
              downloadCsv(`dre-${scope}-${effective.from}-${effective.to}.csv`, csv);
            }}
          >
            <Download className="size-3.5" /> Exportar CSV
          </Button>
          <Badge tone="info">Regime de competência</Badge>
        </div>
      </div>

      <PeriodPicker />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard
          label="Receita Bruta"
          value={grossRevenue?.effective_total ?? 0}
          loading={isLoading}
          tone="info"
        />
        <SummaryCard
          label="Resultado Líquido"
          value={netResult?.effective_total ?? 0}
          loading={isLoading}
          tone={(netResult?.effective_total ?? 0) < 0 ? "expense" : "income"}
        />
        <SummaryCard
          label="Margem Líquida"
          value={
            grossRevenue?.effective_total && netResult
              ? (netResult.effective_total / grossRevenue.effective_total) * 100
              : 0
          }
          loading={isLoading}
          tone="accent"
          format="percent"
        />
      </div>

      <DreTable
        rows={data}
        loading={isLoading}
        drillDown={
          isConsolidated
            ? undefined
            : {
                period: { from: effective.from, to: effective.to },
                companyId: selectedCompanyId,
              }
        }
      />
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
  loading: boolean;
  tone: "income" | "expense" | "info" | "accent";
  format?: "currency" | "percent";
}

function SummaryCard({ label, value, loading, tone, format = "currency" }: SummaryCardProps) {
  const toneClass = {
    income: "text-income",
    expense: "text-expense",
    info: "text-info",
    accent: "text-accent",
  }[tone];

  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">{label}</div>
        {loading ? (
          <div className="h-7 w-32 animate-pulse rounded bg-surface-2" />
        ) : format === "percent" ? (
          <div className={`font-mono text-2xl font-semibold tracking-tight ${toneClass}`}>
            {value.toFixed(1)}%
          </div>
        ) : (
          <div className={`font-mono text-2xl font-semibold tracking-tight ${toneClass}`}>
            {formatBRL(value)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
