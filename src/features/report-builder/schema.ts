/**
 * Configuração de um relatório em PDF — a fonte da verdade da feature.
 *
 * Precisa ser **serializável e agnóstica de saída**: o mesmo objeto vive na URL
 * (nuqs), é salvo em `report_templates.config` e alimenta o driver de PDF. Nada
 * aqui pode depender de React, do navegador ou da biblioteca de PDF.
 */
import { z } from "zod";

/** Versão do schema, gravada junto da config para migração progressiva. */
export const REPORT_CONFIG_VERSION = 1;

/* ─── Blocos ──────────────────────────────────────────────────────────── */

export const BLOCK_TYPES = [
  "cover",
  "kpi-summary",
  "revenue-result-chart",
  "revenue-yoy-chart",
  "revenue-accumulated-yoy-chart",
  "profit-yoy-chart",
  "expense-breakdown",
  "dre",
  "dre-comparison",
  "cashflow",
  "bank-balances",
  "cost-centers",
  "counterparties",
  "forecast",
  "notes",
  "page-break",
] as const;

export type ReportBlockType = (typeof BLOCK_TYPES)[number];

export const COUNTERPARTY_KINDS = [
  "all",
  "customer",
  "supplier",
  "employee",
  "partner",
  "government",
  "other",
] as const;

/**
 * Opções de bloco num objeto plano em vez de união discriminada: quase todo
 * bloco tem zero ou uma opção, e o catálogo (`blocks/catalog.ts`) declara quais
 * chaves cada tipo honra. Evita ~16 variantes de boilerplate para ganho nulo.
 */
export const blockOptionsSchema = z.object({
  /** Título sobrescrito do bloco no PDF. */
  heading: z.string().max(200).optional(),
  /** Texto livre (bloco de notas). */
  text: z.string().max(4000).optional(),
  /** Limite de linhas em blocos de ranking. */
  topN: z.number().int().min(1).max(50).optional(),
  /** Granularidade temporal (fluxo de caixa). */
  granularity: z.enum(["daily", "monthly"]).optional(),
  /** Acompanhar o gráfico de uma tabela de apoio. */
  showTable: z.boolean().optional(),
  /** Acompanhar a tabela de um gráfico de apoio. */
  showChart: z.boolean().optional(),
  /** DRE: incluir a coluna de caixa além da de competência. */
  includeCashColumn: z.boolean().optional(),
  /** Filtro de natureza da contraparte. */
  counterpartyKind: z.enum(COUNTERPARTY_KINDS).optional(),
});

export type BlockOptions = z.infer<typeof blockOptionsSchema>;

export const reportBlockSchema = z.object({
  /** Identidade estável da instância — o mesmo tipo pode entrar mais de uma vez. */
  instanceId: z.string().min(1),
  type: z.enum(BLOCK_TYPES),
  options: blockOptionsSchema.default({}),
});

export type ReportBlock = z.infer<typeof reportBlockSchema>;

/* ─── Escopo ──────────────────────────────────────────────────────────── */

export const reportScopeSchema = z
  .object({
    mode: z.enum(["company", "consolidated"]),
    companyId: z.string().uuid({ message: "Empresa inválida" }).nullable().default(null),
    organizationId: z.string().uuid({ message: "Organização inválida" }),
  })
  .refine((s) => s.mode === "consolidated" || s.companyId !== null, {
    message: "Selecione uma empresa para relatório individual",
    path: ["companyId"],
  });

export type ReportScope = z.infer<typeof reportScopeSchema>;
export type ReportScopeMode = ReportScope["mode"];

/* ─── Período ─────────────────────────────────────────────────────────── */

export const PERIOD_PRESETS = [
  "current_month",
  "last_month",
  "current_quarter",
  "last_quarter",
  "ytd",
  "last_12m",
  "custom",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  current_month: "Mês atual",
  last_month: "Mês anterior",
  current_quarter: "Trimestre atual",
  last_quarter: "Trimestre anterior",
  ytd: "Ano até hoje",
  last_12m: "Últimos 12 meses",
  custom: "Período personalizado",
};

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, { message: "Data inválida" });

export const reportPeriodSchema = z
  .object({
    preset: z.enum(PERIOD_PRESETS),
    /** Usados apenas quando `preset === "custom"`. */
    from: isoDateString.optional(),
    to: isoDateString.optional(),
  })
  .refine((p) => p.preset !== "custom" || (p.from != null && p.to != null), {
    message: "Informe as datas inicial e final",
    path: ["from"],
  })
  .refine((p) => p.preset !== "custom" || (p.from ?? "") <= (p.to ?? ""), {
    message: "Data inicial deve ser anterior à final",
    path: ["to"],
  });

export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

export const COMPARISONS = ["none", "mom", "yoy"] as const;
export type ReportComparison = (typeof COMPARISONS)[number];

export const COMPARISON_LABELS: Record<ReportComparison, string> = {
  none: "Sem comparativo",
  mom: "Período anterior (MoM)",
  yoy: "Ano anterior (YoY)",
};

/* ─── Documento ───────────────────────────────────────────────────────── */

export const reportDocumentSchema = z.object({
  title: z.string().min(1, "Título obrigatório").max(120).default("Relatório Gerencial"),
  subtitle: z.string().max(200).optional(),
  /** Rodapé com numeração "Página X de Y". */
  showPageNumbers: z.boolean().default(true),
  /** Cabeçalho corrido com empresa e período nas páginas internas. */
  showRunningHeader: z.boolean().default(true),
  /** Nota de confidencialidade no rodapé. */
  confidentialityNote: z.string().max(200).optional(),
});

export type ReportDocument = z.infer<typeof reportDocumentSchema>;

/* ─── Config raiz ─────────────────────────────────────────────────────── */

export const reportConfigSchema = z.object({
  version: z.number().int().positive().default(REPORT_CONFIG_VERSION),
  scope: reportScopeSchema,
  period: reportPeriodSchema,
  comparison: z.enum(COMPARISONS).default("none"),
  // `document` e `blocks` têm default para que uma config gravada por uma versão
  // anterior do schema continue carregando em vez de derrubar a tela.
  document: reportDocumentSchema.default({}),
  blocks: z.array(reportBlockSchema).max(60, "Máximo de 60 blocos por relatório").default([]),
});

export type ReportConfig = z.infer<typeof reportConfigSchema>;

/** Config vazia e válida para iniciar o builder. */
export function emptyReportConfig(opts: {
  organizationId: string;
  companyId: string | null;
  mode: ReportScopeMode;
}): ReportConfig {
  return {
    version: REPORT_CONFIG_VERSION,
    scope: {
      mode: opts.mode,
      companyId: opts.mode === "consolidated" ? null : opts.companyId,
      organizationId: opts.organizationId,
    },
    period: { preset: "last_month" },
    comparison: "none",
    document: {
      title: "Relatório Gerencial",
      showPageNumbers: true,
      showRunningHeader: true,
    },
    blocks: [],
  };
}

/**
 * Faz o parse de uma config persistida (banco ou URL), aplicando migração de
 * versão quando necessário. Retorna `null` em vez de lançar — config inválida
 * salva no banco não deve derrubar a tela.
 */
export function parseReportConfig(input: unknown): ReportConfig | null {
  const migrated = migrateReportConfig(input);
  const result = reportConfigSchema.safeParse(migrated);
  return result.success ? result.data : null;
}

/**
 * Ponto único de migração entre versões do schema. Hoje só normaliza a ausência
 * de `version` (configs gravadas antes do campo existir).
 */
function migrateReportConfig(input: unknown): unknown {
  if (input == null || typeof input !== "object") return input;
  const record = input as Record<string, unknown>;
  if (record.version == null) {
    return { ...record, version: REPORT_CONFIG_VERSION };
  }
  return record;
}
