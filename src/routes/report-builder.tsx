/**
 * Exportar Relatório — superfície mínima da Fase 1.
 *
 * O objetivo desta tela é validar o pipeline de geração ponta a ponta (config →
 * dados → PDF multipágina) com a composição fixa capa + DRE. A Fase 3 do plano
 * substitui isto pelo builder de três painéis com catálogo, reordenação e
 * pré-visualização. Ver `docs/features/relatorios-pdf-plan.md`.
 */
import * as React from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { createBlock } from "@/features/report-builder/blocks/catalog";
import { downloadReport, generateReport } from "@/features/report-builder/generate";
import { resolveComparison, resolvePeriod } from "@/features/report-builder/period";
import {
  COMPARISON_LABELS,
  COMPARISONS,
  emptyReportConfig,
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  type PeriodPreset,
  type ReportComparison,
  type ReportConfig,
} from "@/features/report-builder/schema";

// Mesma constante usada em dashboard.tsx e dre.tsx — poderá sair do
// CompanyContext quando `organization_id` for exposto por lá.
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

export default function ReportBuilderPage() {
  const { isConsolidated, selectedCompany, selectedCompanyId } = useCompanyScope();
  const [preset, setPreset] = React.useState<PeriodPreset>("last_month");
  const [comparison, setComparison] = React.useState<ReportComparison>("yoy");
  const [isGenerating, setIsGenerating] = React.useState(false);

  const scopeLabel = isConsolidated
    ? "Consolidado · OTM Group"
    : (selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—");

  const config = React.useMemo<ReportConfig>(() => {
    const base = emptyReportConfig({
      organizationId: ORGANIZATION_ID,
      companyId: selectedCompanyId,
      mode: isConsolidated ? "consolidated" : "company",
    });
    return {
      ...base,
      period: { preset },
      comparison,
      document: { ...base.document, subtitle: scopeLabel },
      blocks: [createBlock("cover", "cover-1"), createBlock("dre", "dre-1")],
    };
  }, [comparison, isConsolidated, preset, scopeLabel, selectedCompanyId]);

  const period = resolvePeriod(config.period);
  const comparisonPeriod = resolveComparison(period, config.comparison);

  const canGenerate = isConsolidated || selectedCompanyId != null;

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const report = await generateReport({ config, scopeLabel });
      downloadReport(report);
      toast.success(`Relatório gerado · ${report.pageCount} página(s)`, {
        description: report.filename,
      });
    } catch (err) {
      toast.error("Falha ao gerar o relatório", { description: (err as Error).message });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            <FileText className="size-3 text-accent" />
            Exportar Relatório
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{scopeLabel}</h1>
          <p className="mt-1 text-sm text-text-muted">
            Monte um relatório gerencial em PDF com capa, indicadores, gráficos e demonstrativos.
          </p>
        </div>
        <Badge tone="info">Prévia · capa + DRE</Badge>
      </div>

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="period">Período</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
                <SelectTrigger id="period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESETS.filter((p) => p !== "custom").map((p) => (
                    <SelectItem key={p} value={p}>
                      {PERIOD_PRESET_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-2xs text-text-subtle">{period.label}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comparison">Comparativo</Label>
              <Select
                value={comparison}
                onValueChange={(v) => setComparison(v as ReportComparison)}
              >
                <SelectTrigger id="comparison">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPARISONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {COMPARISON_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-2xs text-text-subtle">
                {comparisonPeriod?.label ?? "Nenhum"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-2xs text-text-subtle">
              Composição desta prévia: capa e DRE (competência + caixa).
            </p>
            <Button onClick={() => void handleGenerate()} disabled={!canGenerate || isGenerating}>
              {isGenerating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {isGenerating ? "Gerando…" : "Gerar PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
