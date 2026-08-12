/**
 * Catálogo de blocos — **dado, não código condicional**.
 *
 * Cada bloco declara rótulo, grupo, escopos compatíveis, dependências e a altura
 * estimada usada pela paginação. Adicionar um bloco novo é adicionar uma entrada
 * aqui (mais o `draw` correspondente no driver de PDF).
 *
 * A coluna de escopo não é cosmética: só `kpi_dashboard`, `dre` e
 * `expense_breakdown` têm variante consolidada no banco. Os demais RPCs recebem
 * `p_company_id` e existem apenas por empresa — sem esse gate a UI deixaria o
 * usuário montar um relatório que falha na geração.
 */
import {
  BLOCK_TYPES,
  type BlockOptions,
  type ReportBlock,
  type ReportBlockType,
  type ReportComparison,
  type ReportScopeMode,
} from "../schema";

export const BLOCK_GROUPS = [
  "estrutura",
  "indicadores",
  "graficos",
  "demonstrativos",
  "analises",
] as const;

export type BlockGroup = (typeof BLOCK_GROUPS)[number];

export const BLOCK_GROUP_LABELS: Record<BlockGroup, string> = {
  estrutura: "Estrutura",
  indicadores: "Indicadores",
  graficos: "Gráficos",
  demonstrativos: "Demonstrativos",
  analises: "Análises",
};

export interface ReportBlockDefinition {
  type: ReportBlockType;
  label: string;
  /**
   * Rótulo curto para o chip do catálogo. O `label` completo continua na
   * composição e no PDF; aqui o que importa é caber numa linha sem transbordar a
   * coluna.
   */
  shortLabel?: string;
  description: string;
  group: BlockGroup;
  /** Escopos em que o bloco pode ser gerado. */
  scopes: readonly ReportScopeMode[];
  /** Exige um eixo de comparação configurado (MoM/YoY). */
  requiresComparison?: boolean;
  /**
   * Altura estimada em mm, usada pela paginação. Para blocos que crescem com os
   * dados é a altura **base** (cabeçalho + primeiras linhas); o paginador soma o
   * restante a partir dos dados reais.
   */
  estimatedHeightMm: number;
  /** A altura final depende do volume de dados (tabelas, texto). */
  growsWithData?: boolean;
  /** Ocupa a página inteira. */
  fullPage?: boolean;
  /** Opções que este bloco honra — o resto é ignorado. */
  options?: readonly (keyof BlockOptions)[];
  /** Valores iniciais ao inserir o bloco. */
  defaults?: BlockOptions;
}

const BOTH: readonly ReportScopeMode[] = ["company", "consolidated"];
const COMPANY_ONLY: readonly ReportScopeMode[] = ["company"];

export const BLOCK_CATALOG: Record<ReportBlockType, ReportBlockDefinition> = {
  cover: {
    type: "cover",
    label: "Capa",
    description: "Título, empresa, período e data de emissão.",
    group: "estrutura",
    scopes: BOTH,
    estimatedHeightMm: 263,
    fullPage: true,
  },
  "page-break": {
    type: "page-break",
    label: "Quebra de página",
    shortLabel: "Quebra",
    description: "Força o próximo bloco a começar numa página nova.",
    group: "estrutura",
    scopes: BOTH,
    estimatedHeightMm: 0,
  },
  notes: {
    type: "notes",
    label: "Notas e comentários",
    shortLabel: "Notas",
    description: "Texto livre para análise qualitativa.",
    group: "estrutura",
    scopes: BOTH,
    estimatedHeightMm: 30,
    growsWithData: true,
    options: ["heading", "text"],
    defaults: { heading: "Comentários" },
  },

  "kpi-summary": {
    type: "kpi-summary",
    label: "Sumário executivo",
    description: "Cartões com receita, resultado, margens e geração de caixa (YTD).",
    group: "indicadores",
    scopes: BOTH,
    estimatedHeightMm: 58,
    options: ["heading"],
  },

  "revenue-result-chart": {
    type: "revenue-result-chart",
    label: "Receita e resultado mensal",
    shortLabel: "Receita e resultado",
    description: "Barras de receita bruta, líquida e resultado por mês.",
    group: "graficos",
    scopes: BOTH,
    estimatedHeightMm: 88,
    options: ["heading"],
  },
  "revenue-yoy-chart": {
    type: "revenue-yoy-chart",
    label: "Receita bruta — ano vs. ano",
    shortLabel: "Receita bruta (YoY)",
    description: "Barras comparando cada mês com o mesmo mês do ano anterior.",
    group: "graficos",
    scopes: BOTH,
    estimatedHeightMm: 88,
    options: ["heading"],
  },
  "revenue-accumulated-yoy-chart": {
    type: "revenue-accumulated-yoy-chart",
    label: "Receita acumulada — ano vs. ano",
    shortLabel: "Receita acumulada (YoY)",
    description: "Área do acumulado do ano contra o ano anterior.",
    group: "graficos",
    scopes: BOTH,
    estimatedHeightMm: 88,
    options: ["heading"],
  },
  "profit-yoy-chart": {
    type: "profit-yoy-chart",
    label: "Lucro líquido — ano vs. ano",
    shortLabel: "Lucro líquido (YoY)",
    description: "Barras do resultado mensal contra o ano anterior.",
    group: "graficos",
    scopes: BOTH,
    estimatedHeightMm: 88,
    options: ["heading"],
  },
  "expense-breakdown": {
    type: "expense-breakdown",
    label: "Despesas por categoria",
    description: "Rosca das maiores categorias, com tabela de apoio.",
    group: "graficos",
    scopes: BOTH,
    estimatedHeightMm: 95,
    growsWithData: true,
    options: ["heading", "topN", "showTable"],
    defaults: { topN: 8, showTable: true },
  },

  dre: {
    type: "dre",
    label: "DRE",
    description:
      "Demonstrativo de resultado até o resultado líquido, por competência, com coluna de caixa opcional.",
    group: "demonstrativos",
    scopes: BOTH,
    estimatedHeightMm: 40,
    growsWithData: true,
    options: ["heading", "includeCashColumn"],
    defaults: { includeCashColumn: true },
  },
  "dre-comparison": {
    type: "dre-comparison",
    label: "DRE comparativo",
    description: "DRE do período contra o comparativo escolhido, com variação absoluta e %.",
    group: "demonstrativos",
    scopes: COMPANY_ONLY,
    requiresComparison: true,
    estimatedHeightMm: 40,
    growsWithData: true,
    options: ["heading"],
  },
  cashflow: {
    type: "cashflow",
    label: "Fluxo de caixa",
    description: "Entradas, saídas e saldo acumulado no período.",
    group: "demonstrativos",
    scopes: COMPANY_ONLY,
    estimatedHeightMm: 92,
    growsWithData: true,
    options: ["heading", "granularity", "showTable"],
    defaults: { granularity: "monthly", showTable: true },
  },
  "bank-balances": {
    type: "bank-balances",
    label: "Saldos bancários",
    description: "Saldo de cada conta ao fim do período.",
    group: "demonstrativos",
    scopes: COMPANY_ONLY,
    estimatedHeightMm: 32,
    growsWithData: true,
    options: ["heading"],
  },

  "cost-centers": {
    type: "cost-centers",
    label: "Centros de custo",
    description: "Receita, despesa e margem por centro de custo.",
    group: "analises",
    scopes: COMPANY_ONLY,
    estimatedHeightMm: 36,
    growsWithData: true,
    options: ["heading", "showChart"],
    defaults: { showChart: true },
  },
  counterparties: {
    type: "counterparties",
    label: "Principais contrapartes",
    shortLabel: "Contrapartes",
    description: "Ranking de clientes e fornecedores por volume movimentado.",
    group: "analises",
    scopes: COMPANY_ONLY,
    estimatedHeightMm: 36,
    growsWithData: true,
    options: ["heading", "topN", "counterpartyKind"],
    defaults: { topN: 15, counterpartyKind: "all" },
  },
  forecast: {
    type: "forecast",
    label: "Forecast 90 dias",
    description: "Projeção de saldo com base em contas a pagar/receber e recorrências.",
    group: "analises",
    scopes: COMPANY_ONLY,
    estimatedHeightMm: 88,
    options: ["heading"],
  },
};

export function getBlockDefinition(type: ReportBlockType): ReportBlockDefinition {
  return BLOCK_CATALOG[type];
}

/** Rótulo a usar no chip do catálogo. */
export function blockChipLabel(definition: ReportBlockDefinition): string {
  return definition.shortLabel ?? definition.label;
}

/** Todas as definições na ordem do catálogo (estável para a UI). */
export function allBlockDefinitions(): ReportBlockDefinition[] {
  return BLOCK_TYPES.map((type) => BLOCK_CATALOG[type]);
}

export function blockDefinitionsByGroup(group: BlockGroup): ReportBlockDefinition[] {
  return allBlockDefinitions().filter((def) => def.group === group);
}

export interface BlockAvailability {
  available: boolean;
  /** Motivo em pt-BR para exibir na UI quando indisponível. */
  reason?: string;
}

/**
 * O bloco pode ser usado nesta configuração? A UI usa `reason` para desabilitar
 * com explicação em vez de simplesmente esconder.
 */
export function blockAvailability(
  type: ReportBlockType,
  context: { mode: ReportScopeMode; comparison: ReportComparison },
): BlockAvailability {
  const def = BLOCK_CATALOG[type];

  if (!def.scopes.includes(context.mode)) {
    return {
      available: false,
      reason:
        context.mode === "consolidated"
          ? "Disponível apenas para uma empresa específica — não há versão consolidada destes dados."
          : "Disponível apenas no escopo consolidado.",
    };
  }

  if (def.requiresComparison === true && context.comparison === "none") {
    return {
      available: false,
      reason: "Exige um eixo de comparação (período anterior ou ano anterior).",
    };
  }

  return { available: true };
}

/** Blocos utilizáveis na configuração atual. */
export function availableBlockDefinitions(context: {
  mode: ReportScopeMode;
  comparison: ReportComparison;
}): ReportBlockDefinition[] {
  return allBlockDefinitions().filter((def) => blockAvailability(def.type, context).available);
}

/** Cria uma instância do bloco com os defaults do catálogo. */
export function createBlock(type: ReportBlockType, instanceId?: string): ReportBlock {
  return {
    instanceId: instanceId ?? crypto.randomUUID(),
    type,
    options: { ...BLOCK_CATALOG[type].defaults },
  };
}
