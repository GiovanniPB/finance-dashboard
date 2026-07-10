import { formatDate } from "@/lib/dates";

import type { InvoiceJob } from "./api";
import { AMBIENTE_META, DOCUMENT_TYPE_META, JOB_STATUS_META } from "./constants";

export type ExportFormat = "csv" | "xlsx";

/** Uma linha de exportação: cabeçalhos em pt-BR (a ordem é preservada na planilha). */
export type ExportRow = Record<string, string | number>;

function companyName(job: InvoiceJob): string {
  return job.company?.trade_name ?? job.company?.legal_name ?? "";
}

function originLabel(job: InvoiceJob): string {
  const source = (job.metadata as { source?: string } | null)?.source;
  return source === "backfill" ? "Retroativa" : "Webhook";
}

/**
 * Mapeia as notas para linhas planas voltadas à contabilidade (série/número,
 * valor numérico, tomador, chave). Puro e testável. Valor sai como número para o
 * Excel tratar como célula numérica.
 */
export function buildExportRows(jobs: InvoiceJob[]): ExportRow[] {
  return jobs.map((job) => ({
    "Criada em": formatDate(job.created_at),
    Empresa: companyName(job),
    Documento: DOCUMENT_TYPE_META[job.document_type ?? "nfse"]?.label ?? job.document_type ?? "",
    Ambiente: AMBIENTE_META[job.ambiente]?.label ?? job.ambiente,
    Origem: originLabel(job),
    Status: JOB_STATUS_META[job.status]?.label ?? job.status,
    Série: job.serie ?? "",
    Número: job.numero_nfse ?? "",
    Tomador: job.tomador_nome ?? "",
    "Documento tomador": job.tomador_documento ?? "",
    "Valor (R$)": job.valor_servicos,
    Conexão: job.account?.label ?? "",
    Chave: job.chave_nfse ?? "",
    "Cobrança (pagar.me)": job.pagarme_charge_id ?? "",
  }));
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Nome de arquivo estável: notas-nfse-AAAA-MM-DD.<ext>. */
export function exportFilename(base = "notas-nfse"): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Exporta as notas em CSV ou Excel. A lib `xlsx` é importada dinamicamente (só no
 * clique) para não pesar o bundle. CSV usa `;` (padrão pt-BR do Excel) + BOM para
 * acentuação correta.
 */
export async function exportInvoiceJobs(
  jobs: InvoiceJob[],
  format: ExportFormat,
  base?: string,
): Promise<void> {
  const rows = buildExportRows(jobs);
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const filename = `${exportFilename(base)}.${format}`;
  const BOM = String.fromCharCode(0xfeff); // faz o Excel abrir CSV como UTF-8

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    downloadBlob(new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" }), filename);
    return;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Notas");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}
