/**
 * Redutores da configuração — funções puras, sem React.
 *
 * Toda alteração devolve uma `ReportConfig` nova; nada é mutado. Ficam separadas
 * do hook de estado justamente para serem testáveis sem renderizar nada.
 */
import { blockAvailability, createBlock } from "./blocks/catalog";
import type {
  BlockOptions,
  ReportBlock,
  ReportBlockType,
  ReportComparison,
  ReportConfig,
  ReportDocument,
  ReportPeriod,
  ReportScope,
} from "./schema";

/** Limite espelhado do schema, para o redutor não produzir config inválida. */
const MAX_BLOCKS = 60;

export function addBlock(
  config: ReportConfig,
  type: ReportBlockType,
  instanceId?: string,
): ReportConfig {
  if (config.blocks.length >= MAX_BLOCKS) return config;
  return { ...config, blocks: [...config.blocks, createBlock(type, instanceId)] };
}

/** Insere logo depois de `afterInstanceId`, ou no fim se não achar. */
export function insertBlockAfter(
  config: ReportConfig,
  type: ReportBlockType,
  afterInstanceId: string,
  instanceId?: string,
): ReportConfig {
  if (config.blocks.length >= MAX_BLOCKS) return config;
  const index = config.blocks.findIndex((b) => b.instanceId === afterInstanceId);
  if (index < 0) return addBlock(config, type, instanceId);

  const blocks = [...config.blocks];
  blocks.splice(index + 1, 0, createBlock(type, instanceId));
  return { ...config, blocks };
}

export function removeBlock(config: ReportConfig, instanceId: string): ReportConfig {
  const blocks = config.blocks.filter((b) => b.instanceId !== instanceId);
  if (blocks.length === config.blocks.length) return config;
  return { ...config, blocks };
}

export type MoveDirection = "up" | "down";

/** Troca o bloco com o vizinho. Nas pontas devolve a config intacta. */
export function moveBlock(
  config: ReportConfig,
  instanceId: string,
  direction: MoveDirection,
): ReportConfig {
  const index = config.blocks.findIndex((b) => b.instanceId === instanceId);
  if (index < 0) return config;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= config.blocks.length) return config;

  const blocks = [...config.blocks];
  const moved = blocks[index];
  const swapped = blocks[target];
  if (moved == null || swapped == null) return config;
  blocks[index] = swapped;
  blocks[target] = moved;
  return { ...config, blocks };
}

/** Reordena por índice — usado pelo arrastar e soltar. */
export function reorderBlocks(
  config: ReportConfig,
  fromIndex: number,
  toIndex: number,
): ReportConfig {
  if (fromIndex === toIndex) return config;
  if (fromIndex < 0 || fromIndex >= config.blocks.length) return config;
  if (toIndex < 0 || toIndex >= config.blocks.length) return config;

  const blocks = [...config.blocks];
  const [moved] = blocks.splice(fromIndex, 1);
  if (moved == null) return config;
  blocks.splice(toIndex, 0, moved);
  return { ...config, blocks };
}

export function updateBlockOptions(
  config: ReportConfig,
  instanceId: string,
  patch: Partial<BlockOptions>,
): ReportConfig {
  let changed = false;
  const blocks = config.blocks.map((block) => {
    if (block.instanceId !== instanceId) return block;
    changed = true;
    return { ...block, options: { ...block.options, ...patch } };
  });
  return changed ? { ...config, blocks } : config;
}

export function setPeriod(config: ReportConfig, period: ReportPeriod): ReportConfig {
  return { ...config, period };
}

/**
 * Troca o eixo de comparação e remove blocos que dependiam dele — `dre-comparison`
 * sem comparativo não tem o que comparar.
 */
export function setComparison(config: ReportConfig, comparison: ReportComparison): PruneResult {
  return pruneIncompatibleBlocks({ ...config, comparison });
}

export function updateDocument(config: ReportConfig, patch: Partial<ReportDocument>): ReportConfig {
  return { ...config, document: { ...config.document, ...patch } };
}

export interface PruneResult {
  config: ReportConfig;
  /** Tipos removidos, para a UI avisar em vez de sumir com o bloco em silêncio. */
  removed: ReportBlockType[];
}

/**
 * Troca o escopo e remove o que não existe nele. Trocar de empresa para
 * consolidado invalida 6 dos 16 blocos (não há RPC consolidada), e deixá-los na
 * composição geraria um relatório cheio de "sem dados".
 */
export function setScope(config: ReportConfig, scope: ReportScope): PruneResult {
  return pruneIncompatibleBlocks({ ...config, scope });
}

/** Remove blocos indisponíveis no escopo e comparativo atuais. */
export function pruneIncompatibleBlocks(config: ReportConfig): PruneResult {
  const context = { mode: config.scope.mode, comparison: config.comparison };
  const removed: ReportBlockType[] = [];

  const blocks = config.blocks.filter((block) => {
    if (blockAvailability(block.type, context).available) return true;
    removed.push(block.type);
    return false;
  });

  if (removed.length === 0) return { config, removed: [] };
  return { config: { ...config, blocks }, removed: [...new Set(removed)] };
}

/** Substitui a composição inteira, preservando escopo, período e documento. */
export function replaceBlocks(config: ReportConfig, blocks: ReportBlock[]): ReportConfig {
  return { ...config, blocks: blocks.slice(0, MAX_BLOCKS) };
}
