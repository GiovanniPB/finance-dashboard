/**
 * Estado da configuração do relatório, persistido na URL.
 *
 * O escopo **não** vai para a URL: vem do seletor de empresa do topo, que é o
 * estado global da aplicação. O que vai é o que descreve o relatório — período,
 * comparativo, documento e composição —, exatamente o objeto que a Fase 4 vai
 * salvar em `report_templates`.
 */
import * as React from "react";
import { parseAsJson, useQueryState } from "nuqs";
import { z } from "zod";

import { createBlock } from "./blocks/catalog";
import * as reducers from "./configReducers";
import type { ReportPreset } from "./presets";
import {
  COMPARISONS,
  REPORT_CONFIG_VERSION,
  reportBlockSchema,
  reportDocumentSchema,
  reportPeriodSchema,
  type BlockOptions,
  type ReportBlockType,
  type ReportComparison,
  type ReportConfig,
  type ReportDocument,
  type ReportPeriod,
  type ReportScope,
} from "./schema";

/** Recorte serializável da config — tudo menos o escopo. */
const draftSchema = z.object({
  period: reportPeriodSchema,
  comparison: z.enum(COMPARISONS),
  document: reportDocumentSchema,
  blocks: z.array(reportBlockSchema),
});

type ReportDraft = z.infer<typeof draftSchema>;

const QUERY_KEY = "relatorio";

function defaultDraft(): ReportDraft {
  return {
    period: { preset: "last_month" },
    comparison: "yoy",
    document: {
      title: "Relatório Gerencial",
      showPageNumbers: true,
      showRunningHeader: true,
    },
    blocks: [
      createBlock("cover", "cover"),
      createBlock("kpi-summary", "kpis"),
      createBlock("dre", "dre"),
    ],
  };
}

/** `parseAsJson` exige um validador que lança; o Zod já faz isso. */
const parseDraft = parseAsJson((value: unknown) => draftSchema.parse(value));

export interface UseReportConfigResult {
  config: ReportConfig;
  /** Tipos removidos pela última poda, para a UI avisar. */
  lastRemoved: ReportBlockType[];
  clearLastRemoved: () => void;
  addBlock: (type: ReportBlockType) => void;
  insertAfter: (type: ReportBlockType, afterInstanceId: string) => void;
  removeBlock: (instanceId: string) => void;
  moveBlock: (instanceId: string, direction: reducers.MoveDirection) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  updateBlockOptions: (instanceId: string, patch: Partial<BlockOptions>) => void;
  setPeriod: (period: ReportPeriod) => void;
  setComparison: (comparison: ReportComparison) => void;
  updateDocument: (patch: Partial<ReportDocument>) => void;
  applyPreset: (preset: ReportPreset) => void;
  /** Carrega uma config inteira (de um template salvo). */
  loadConfig: (config: ReportConfig) => void;
  reset: () => void;
}

export function useReportConfig(scope: ReportScope): UseReportConfigResult {
  const [draft, setDraft] = useQueryState(QUERY_KEY, parseDraft.withDefault(defaultDraft()));
  const [lastRemoved, setLastRemoved] = React.useState<ReportBlockType[]>([]);

  const config = React.useMemo<ReportConfig>(
    () => ({ version: REPORT_CONFIG_VERSION, scope, ...draft }),
    [scope, draft],
  );

  const commit = React.useCallback(
    (next: ReportConfig) => {
      const { period, comparison, document, blocks } = next;
      void setDraft({ period, comparison, document, blocks });
    },
    [setDraft],
  );

  const commitPruned = React.useCallback(
    (result: reducers.PruneResult) => {
      commit(result.config);
      if (result.removed.length > 0) setLastRemoved(result.removed);
    },
    [commit],
  );

  // O escopo muda por fora (seletor de empresa). Quando isso invalida blocos, a
  // poda tem de acontecer aqui — senão a composição fica com blocos que o escopo
  // não gera e o relatório sai cheio de "sem dados".
  const scopeKey = `${scope.mode}:${scope.companyId ?? ""}`;
  const lastScopeKey = React.useRef(scopeKey);
  React.useEffect(() => {
    if (lastScopeKey.current === scopeKey) return;
    lastScopeKey.current = scopeKey;
    const result = reducers.pruneIncompatibleBlocks(config);
    if (result.removed.length > 0) commitPruned(result);
  }, [scopeKey, config, commitPruned]);

  return {
    config,
    lastRemoved,
    clearLastRemoved: React.useCallback(() => setLastRemoved([]), []),

    addBlock: React.useCallback(
      (type) => commit(reducers.addBlock(config, type)),
      [commit, config],
    ),
    insertAfter: React.useCallback(
      (type, afterInstanceId) => commit(reducers.insertBlockAfter(config, type, afterInstanceId)),
      [commit, config],
    ),
    removeBlock: React.useCallback(
      (instanceId) => commit(reducers.removeBlock(config, instanceId)),
      [commit, config],
    ),
    moveBlock: React.useCallback(
      (instanceId, direction) => commit(reducers.moveBlock(config, instanceId, direction)),
      [commit, config],
    ),
    reorderBlocks: React.useCallback(
      (fromIndex, toIndex) => commit(reducers.reorderBlocks(config, fromIndex, toIndex)),
      [commit, config],
    ),
    updateBlockOptions: React.useCallback(
      (instanceId, patch) => commit(reducers.updateBlockOptions(config, instanceId, patch)),
      [commit, config],
    ),
    setPeriod: React.useCallback(
      (period) => commit(reducers.setPeriod(config, period)),
      [commit, config],
    ),
    setComparison: React.useCallback(
      (comparison) => commitPruned(reducers.setComparison(config, comparison)),
      [commitPruned, config],
    ),
    updateDocument: React.useCallback(
      (patch) => commit(reducers.updateDocument(config, patch)),
      [commit, config],
    ),
    applyPreset: React.useCallback(
      (preset) => {
        const blocks = preset.blocks.map((type, i) => createBlock(type, `${type}-${i}`));
        commit({
          ...config,
          period: { preset: preset.period },
          comparison: preset.comparison,
          blocks,
        });
      },
      [commit, config],
    ),
    // O escopo NÃO vem do template: a empresa em vigor é a do seletor do topo.
    // Um template salvo por empresa aberto no consolidado tem blocos que aquele
    // escopo não gera, então a poda entra aqui.
    loadConfig: React.useCallback(
      (loaded: ReportConfig) =>
        commitPruned(
          reducers.pruneIncompatibleBlocks({ ...loaded, scope, version: config.version }),
        ),
      [commitPruned, scope, config.version],
    ),
    reset: React.useCallback(() => void setDraft(null), [setDraft]),
  };
}
