/**
 * Exportar Relatório — o builder.
 *
 * Três painéis: catálogo, composição e prévia. O escopo vem do seletor de empresa
 * do topo; o resto da configuração vive na URL, então o estado é compartilhável e
 * é o mesmo objeto que a Fase 4 vai salvar como template.
 */
import * as React from "react";
import { FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { getBlockDefinition } from "@/features/report-builder/blocks/catalog";
import { BlockCatalog } from "@/features/report-builder/components/BlockCatalog";
import { BlockComposition } from "@/features/report-builder/components/BlockComposition";
import { ReportPreview } from "@/features/report-builder/components/ReportPreview";
import { ReportSettings } from "@/features/report-builder/components/ReportSettings";
import type { ReportScope } from "@/features/report-builder/schema";
import { useReportConfig } from "@/features/report-builder/useReportConfig";

// Mesma constante de dashboard.tsx e dre.tsx — sai daqui quando o
// CompanyContext expor `organization_id`.
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

export default function ReportBuilderPage() {
  const { isConsolidated, selectedCompany, selectedCompanyId } = useCompanyScope();

  const scope = React.useMemo<ReportScope>(
    () => ({
      mode: isConsolidated ? "consolidated" : "company",
      companyId: isConsolidated ? null : selectedCompanyId,
      organizationId: ORGANIZATION_ID,
    }),
    [isConsolidated, selectedCompanyId],
  );

  const report = useReportConfig(scope);
  const { config } = report;

  const scopeLabel = isConsolidated
    ? "Consolidado · OTM Group"
    : (selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—");

  const disabledReason =
    !isConsolidated && selectedCompanyId == null
      ? "Selecione uma empresa no seletor superior para gerar o relatório."
      : undefined;

  // Avisa o que a troca de escopo ou de comparativo removeu, em vez de o bloco
  // desaparecer da composição em silêncio.
  React.useEffect(() => {
    if (report.lastRemoved.length === 0) return;
    const labels = report.lastRemoved.map((type) => getBlockDefinition(type).label).join(", ");
    toast.info("Blocos removidos da composição", {
      description: `${labels} — não existe${report.lastRemoved.length > 1 ? "m" : ""} nesta configuração.`,
    });
    report.clearLastRemoved();
  }, [report]);

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
            Monte o relatório escolhendo os blocos, o período e o comparativo. A prévia é o próprio
            PDF.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info">{config.blocks.length} bloco(s)</Badge>
          <Button variant="outline" size="sm" onClick={report.reset}>
            <RotateCcw className="size-3.5" /> Recomeçar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <ReportSettings
            config={config}
            onPeriodChange={(preset) =>
              report.setPeriod(
                preset === "custom"
                  ? {
                      preset,
                      from: config.period.from ?? isoToday(),
                      to: config.period.to ?? isoToday(),
                    }
                  : { preset },
              )
            }
            onCustomRangeChange={(from, to) => report.setPeriod({ preset: "custom", from, to })}
            onComparisonChange={report.setComparison}
            onDocumentChange={report.updateDocument}
            onApplyPreset={report.applyPreset}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_minmax(340px,42%)]">
        <Card className="h-fit">
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Catálogo</h2>
            <BlockCatalog
              mode={config.scope.mode}
              comparison={config.comparison}
              onAdd={report.addBlock}
            />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Composição</h2>
            <BlockComposition
              blocks={config.blocks}
              onRemove={report.removeBlock}
              onMove={report.moveBlock}
              onReorder={report.reorderBlocks}
              onOptionsChange={report.updateBlockOptions}
            />
          </CardContent>
        </Card>

        <Card className="h-fit xl:sticky xl:top-6">
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Prévia</h2>
            <ReportPreview
              config={config}
              scopeLabel={scopeLabel}
              disabledReason={disabledReason}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function isoToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
