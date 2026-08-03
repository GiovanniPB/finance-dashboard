/**
 * Fronteira de carregamento sob demanda.
 *
 * `jspdf` + `jspdf-autotable` só entram no bundle quando o usuário gera um
 * relatório de fato — mesmo padrão já usado com `xlsx` na exportação de NFS-e
 * (`src/features/nfse/export.ts`). Os tipos vêm por `import type`, que o
 * TypeScript apaga na compilação, então importá-los aqui não puxa o runtime.
 */
import { fetchReportData } from "./data/fetchReportData";
import type { GeneratedReport } from "./pdf/jsPdfDriver";
import { resolveComparison, resolvePeriod } from "./period";
import type { ReportConfig } from "./schema";

export interface GenerateReportInput {
  config: ReportConfig;
  /** Nome fantasia da empresa, ou rótulo do consolidado. */
  scopeLabel: string;
  /** Referência para resolver presets de período. Injetável para testes. */
  now?: Date;
}

/**
 * Resolve período → busca os dados → gera o PDF. Devolve o blob e o que foi
 * ignorado, sem baixar nada: quem chama decide o que fazer com o resultado.
 */
export async function generateReport(input: GenerateReportInput): Promise<GeneratedReport> {
  const now = input.now ?? new Date();
  const period = resolvePeriod(input.config.period, now);
  const comparisonPeriod = resolveComparison(period, input.config.comparison);

  const issuedAt = toIsoDate(now);
  const data = await fetchReportData({
    config: input.config,
    period,
    comparisonPeriod,
    issuedAt,
  });

  const { generateReportPdf } = await import("./pdf/jsPdfDriver");
  return generateReportPdf({
    config: input.config,
    data,
    period,
    comparisonPeriod,
    scopeLabel: input.scopeLabel,
    issuedAt,
  });
}

/** Dispara o download de um relatório já gerado. */
export function downloadReport(report: GeneratedReport): void {
  const url = URL.createObjectURL(report.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = report.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
