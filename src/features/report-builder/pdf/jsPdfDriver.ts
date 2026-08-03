/**
 * Driver de saída em jsPDF.
 *
 * Este módulo (e sua árvore de imports: jspdf, jspdf-autotable, os blocos) é
 * **carregado sob demanda** — ver `../generate.ts`. Por isso os blocos podem
 * importar `jspdf-autotable` estaticamente sem pesar no bundle inicial.
 *
 * Ordem do fluxo: cria o documento → desenha os blocos em sequência, deixando o
 * cursor decidir as quebras → estampa cabeçalho/rodapé num passe final, quando
 * o total de páginas já é conhecido.
 */
import { getBlockDefinition } from "../blocks/catalog";
import type { ReportData } from "../data/types";
import { LayoutCursor } from "../layout/cursor";
import type { ResolvedPeriod } from "../period";
import type { ReportBlockType, ReportConfig } from "../schema";
import { BLOCK_RENDERERS } from "./blocks";
import { stampPageChrome } from "./chrome";
import type { BlockRendererRegistry, ReportRenderContext } from "./driver";
import { PAGE, PDF_UNIT } from "./reportTheme";

export interface GenerateReportPdfInput {
  config: ReportConfig;
  data: ReportData;
  period: ResolvedPeriod;
  comparisonPeriod: ResolvedPeriod | null;
  /** Nome fantasia da empresa, ou rótulo do consolidado. */
  scopeLabel: string;
  /** Data de emissão em ISO. Injetada para a saída ser determinística. */
  issuedAt: string;
  /** Sobrescrita do registro de renderers — usada nos testes. */
  renderers?: BlockRendererRegistry;
}

export interface GeneratedReport {
  blob: Blob;
  pageCount: number;
  /** Blocos ignorados por não haver renderer implementado. */
  skippedBlocks: ReportBlockType[];
  filename: string;
}

export async function generateReportPdf(input: GenerateReportPdfInput): Promise<GeneratedReport> {
  const { config, data, period, comparisonPeriod, scopeLabel, issuedAt } = input;
  const renderers = input.renderers ?? BLOCK_RENDERERS;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: PDF_UNIT,
    format: PAGE.format,
    orientation: "portrait",
    compress: true,
  });

  doc.setProperties({
    title: config.document.title,
    subject: `${scopeLabel} · ${period.label}`,
    author: "OTM Group",
    creator: "Finance Dashboard",
  });

  const cursor = new LayoutCursor({
    topMm: PAGE.margin.top + PAGE.headerHeightMm,
    bottomMm: PAGE.heightMm - PAGE.margin.bottom - PAGE.footerHeightMm,
    onNewPage: () => {
      doc.addPage();
    },
  });

  const ctx: ReportRenderContext = {
    doc,
    cursor,
    config,
    period,
    comparisonPeriod,
    scopeLabel,
    issuedAt,
    data,
  };

  const skippedBlocks = config.blocks
    .filter((block) => renderers[block.type] == null)
    .map((block) => block.type);

  const renderable = config.blocks.filter((block) => renderers[block.type] != null);
  const fullPagePages = new Set<number>();

  renderable.forEach((block, index) => {
    const definition = getBlockDefinition(block.type);
    const renderer = renderers[block.type];
    if (renderer == null) return;

    if (definition.fullPage === true) {
      if (!cursor.isAtPageStart()) cursor.newPage();
      fullPagePages.add(cursor.page);
    }

    renderer(ctx, block);

    // Bloco de página inteira empurra o próximo para a página seguinte — mas só
    // se houver próximo, senão sobraria uma página em branco no fim.
    if (definition.fullPage === true && index < renderable.length - 1) {
      cursor.newPage();
    }
  });

  stampPageChrome({ doc, config, scopeLabel, period, skipPages: fullPagePages });

  return {
    blob: doc.output("blob"),
    pageCount: doc.getNumberOfPages(),
    skippedBlocks: [...new Set(skippedBlocks)],
    filename: buildFilename(config.document.title, period),
  };
}

/** `Relatório Gerencial` + período → `relatorio-gerencial-2026-07-01_2026-07-31.pdf`. */
export function buildFilename(title: string, period: ResolvedPeriod): string {
  return `${slugify(title)}-${period.from}_${period.to}.pdf`;
}

function slugify(value: string): string {
  const withoutAccents = value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const slug = withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug === "" ? "relatorio" : slug;
}
