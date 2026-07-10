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

function fmtDateOrEmpty(iso: string | null | undefined): string {
  return iso ? formatDate(iso) : "";
}

/** Base do nome de arquivo do XML/PDF no ZIP: chave (44 díg.) > número > id. */
export function exportFileBaseName(job: InvoiceJob): string {
  const raw = job.chave_nfse ?? job.numero_nfse ?? job.id;
  return raw.replace(/[^\w.-]/gu, "_");
}

/**
 * Mapeia as notas para linhas planas voltadas à contabilidade — os campos que o
 * contador imputa no sistema fiscal: data de emissão, série/número, chave de
 * acesso, protocolo, valor (numérico), tomador. Puro e testável.
 */
export function buildExportRows(jobs: InvoiceJob[]): ExportRow[] {
  return jobs.map((job) => {
    const authorized = job.status === "authorized";
    return {
      "Data de emissão": fmtDateOrEmpty(job.emitida_em),
      Empresa: companyName(job),
      Documento: DOCUMENT_TYPE_META[job.document_type ?? "nfse"]?.label ?? job.document_type ?? "",
      Série: job.serie ?? "",
      Número: job.numero_nfse ?? "",
      "Chave de acesso": job.chave_nfse ?? "",
      Protocolo: job.protocolo ?? "",
      Status: JOB_STATUS_META[job.status]?.label ?? job.status,
      Ambiente: AMBIENTE_META[job.ambiente]?.label ?? job.ambiente,
      Tomador: job.tomador_nome ?? "",
      "Documento tomador": job.tomador_documento ?? "",
      "Valor (R$)": job.valor_servicos,
      Origem: originLabel(job),
      Conexão: job.account?.label ?? "",
      "Mensagem SEFAZ": job.mensagem_sefaz ?? "",
      "Cobrança (pagar.me)": job.pagarme_charge_id ?? "",
      "Arquivo XML": authorized && job.xml_path ? `${exportFileBaseName(job)}.xml` : "",
      "Criada em": formatDate(job.created_at),
    };
  });
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

/** Nome de arquivo estável: notas-nfse-AAAA-MM-DD. */
export function exportFilename(base = "notas-nfse"): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}`;
}

const BOM = String.fromCharCode(0xfeff); // faz o Excel abrir CSV como UTF-8

/** Planilha (array de linhas) -> ArrayBuffer .xlsx. */
async function rowsToXlsxBuffer(rows: ExportRow[]): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Notas");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

/**
 * Exporta as notas em CSV ou Excel. `xlsx` é importada dinamicamente (só no
 * clique). CSV usa `;` (padrão pt-BR do Excel) + BOM para acentuação correta.
 */
export async function exportInvoiceJobs(
  jobs: InvoiceJob[],
  format: ExportFormat,
  base?: string,
): Promise<void> {
  const rows = buildExportRows(jobs);
  const filename = `${exportFilename(base)}.${format}`;

  if (format === "csv") {
    const XLSX = await import("xlsx");
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows), { FS: ";" });
    downloadBlob(new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" }), filename);
    return;
  }

  const buf = await rowsToXlsxBuffer(rows);
  downloadBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}

export interface ZipExportResult {
  xmls: number; // XMLs incluídos
  missing: number; // autorizadas cujo arquivo não pôde ser baixado
}

/**
 * "Pacote contábil": ZIP com a planilha (.xlsx) + os XMLs e DANFEs das notas
 * AUTORIZADAS (o documento fiscal que o contador importa). `jszip` é importada
 * dinamicamente. O download dos arquivos é injetado (`downloadFile`) para manter
 * este módulo desacoplado do cliente Supabase.
 */
export async function exportInvoiceJobsZip(
  jobs: InvoiceJob[],
  downloadFile: (path: string) => Promise<Blob | null>,
  onProgress?: (done: number, total: number) => void,
  base?: string,
): Promise<ZipExportResult> {
  const [{ default: JSZip }, buf] = await Promise.all([
    import("jszip"),
    rowsToXlsxBuffer(buildExportRows(jobs)),
  ]);

  const zip = new JSZip();
  zip.file(`${exportFilename(base)}.xlsx`, buf);
  const xmlFolder = zip.folder("xml");
  const danfeFolder = zip.folder("danfe");

  const authorized = jobs.filter((j) => j.status === "authorized" && j.xml_path);
  let xmls = 0;
  let missing = 0;

  for (let i = 0; i < authorized.length; i += 1) {
    const job = authorized[i];
    const name = exportFileBaseName(job);
    if (job.xml_path) {
      const blob = await downloadFile(job.xml_path);
      if (blob) {
        xmlFolder?.file(`${name}.xml`, blob);
        xmls += 1;
      } else {
        missing += 1;
      }
    }
    if (job.danfse_path) {
      const pdf = await downloadFile(job.danfse_path);
      if (pdf) danfeFolder?.file(`${name}.pdf`, pdf);
    }
    onProgress?.(i + 1, authorized.length);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, `${exportFilename(base)}.zip`);
  return { xmls, missing };
}
