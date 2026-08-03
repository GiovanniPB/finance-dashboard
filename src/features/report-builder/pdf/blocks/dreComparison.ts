/**
 * DRE comparativo — período contra o comparativo escolhido, com variação.
 *
 * A variação percentual vem do banco como `null` quando a base é zero: nesse caso
 * mostramos "—" em vez de inventar um percentual, porque crescer a partir de zero
 * não tem taxa definida.
 */
import { formatBRL } from "@/lib/format";

import { compactLabelForRange } from "../../period";
import type { BlockRenderer } from "../driver";
import { COLORS, CONTENT } from "../reportTheme";
import { renderEmptyBlock } from "./chartBlock";
import { renderTableBlock, type TableColumn } from "./table";

const CODE_WIDTH_MM = 16;
const VALUE_WIDTH_MM = 28;
const VARIATION_WIDTH_MM = 24;
const INDENT_PER_DEPTH_MM = 3;

/** Índices no corpo montado. */
const COLUMN = { totalA: 2, totalB: 3, varianceAbs: 4, variancePct: 5 } as const;

export const renderDreComparison: BlockRenderer = (ctx, block) => {
  const rows = ctx.data.dreComparison;
  const heading = block.options.heading ?? "DRE comparativo";
  const comparison = ctx.comparisonPeriod;

  if (rows == null || rows.length === 0) {
    renderEmptyBlock(
      ctx,
      heading,
      ctx.period.label,
      comparison == null
        ? "Escolha um eixo de comparação para gerar este bloco."
        : ctx.config.scope.mode === "consolidated"
          ? "Comparativo de DRE não tem versão consolidada — selecione uma empresa."
          : "Sem lançamentos nos períodos comparados.",
    );
    return;
  }

  const summaryRows = new Set(rows.map((row, i) => (row.isSummary ? i : -1)).filter((i) => i >= 0));

  renderTableBlock(ctx, {
    heading,
    eyebrow: `${ctx.period.label} vs ${comparison?.label ?? "—"}`,
    // Rótulo compacto no cabeçalho: o label cheio ("2026 (até 31/07/2026)")
    // quebra em duas linhas numa coluna de 28mm. O período completo fica no eyebrow.
    head: [
      [
        "Código",
        "Conta",
        compactLabelForRange(ctx.period.from, ctx.period.to),
        comparison == null ? "—" : compactLabelForRange(comparison.from, comparison.to),
        "Variação",
        "%",
      ],
    ],
    body: rows.map((row) => [
      row.code,
      row.name,
      formatBRL(row.totalA),
      formatBRL(row.totalB),
      formatBRL(row.varianceAbs),
      formatVariancePct(row.variancePct),
    ]),
    columns: buildColumns(),
    summaryRows,
    rowIndentMm: (rowIndex) => depthOf(rows[rowIndex]?.code) * INDENT_PER_DEPTH_MM,
    cellTextColor: (rowIndex, columnIndex) => {
      const row = rows[rowIndex];
      if (row == null) return undefined;
      const value = valueForColumn(row, columnIndex);
      return value != null && value < 0 ? COLORS.expense : undefined;
    },
  });
};

function buildColumns(): TableColumn[] {
  const nameWidth = CONTENT.widthMm - CODE_WIDTH_MM - VALUE_WIDTH_MM * 3 - VARIATION_WIDTH_MM;
  return [
    { width: CODE_WIDTH_MM },
    { width: nameWidth },
    { width: VALUE_WIDTH_MM, align: "right" },
    { width: VALUE_WIDTH_MM, align: "right" },
    { width: VALUE_WIDTH_MM, align: "right" },
    { width: VARIATION_WIDTH_MM, align: "right" },
  ];
}

function valueForColumn(
  row: { totalA: number; totalB: number; varianceAbs: number },
  columnIndex: number,
): number | null {
  if (columnIndex === COLUMN.totalA) return row.totalA;
  if (columnIndex === COLUMN.totalB) return row.totalB;
  if (columnIndex === COLUMN.varianceAbs) return row.varianceAbs;
  return null;
}

/**
 * `dre_comparison` não expõe profundidade; derivamos do código da conta
 * (`4.01.02` → nível 2), como a árvore do plano de contas já faz.
 */
function depthOf(code: string | undefined): number {
  if (code == null || code === "") return 0;
  return code.split(".").length - 1;
}

function formatVariancePct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")}%`;
}
