/**
 * Principais contrapartes por volume movimentado.
 *
 * O limite e o filtro de natureza vêm das opções do bloco e são aplicados **na
 * consulta** (`counterparty_analysis` recebe `p_limit` e `p_kind`), não aqui —
 * então a tabela mostra o que o banco devolveu.
 */
import { formatBRL, formatNumber } from "@/lib/format";

import type { CounterpartyKind } from "../../schema";
import type { BlockRenderer } from "../driver";
import { COLORS, CONTENT } from "../reportTheme";
import { renderEmptyBlock } from "./chartBlock";
import { formatOutflow, isNegativeValue } from "./shared";
import { renderTableBlock } from "./table";

const VALUE_WIDTH_MM = 30;
const COUNT_WIDTH_MM = 18;

/** Rótulos das naturezas — espelham o enum do banco. */
const KIND_LABELS: Record<CounterpartyKind, string> = {
  all: "todas as naturezas",
  customer: "clientes",
  supplier: "fornecedores",
  employee: "funcionários",
  partner: "sócios",
  government: "governo",
  other: "outras",
};

export const renderCounterparties: BlockRenderer = (ctx, block) => {
  const rows = ctx.data.counterparties;
  const heading = block.options.heading ?? "Principais contrapartes";
  const kind = block.options.counterpartyKind ?? "all";

  if (rows == null || rows.length === 0) {
    renderEmptyBlock(
      ctx,
      heading,
      ctx.period.label,
      ctx.config.scope.mode === "consolidated"
        ? "Contrapartes não têm versão consolidada — selecione uma empresa."
        : "Sem movimentação por contraparte no período.",
    );
    return;
  }

  renderTableBlock(ctx, {
    heading,
    eyebrow: `${ctx.period.label} · ${KIND_LABELS[kind]}`,
    head: [["Contraparte", "Entradas", "Saídas", "Líquido", "Lanç."]],
    body: rows.map((row) => [
      row.name,
      formatBRL(row.totalInflow),
      formatOutflow(row.totalOutflow),
      formatBRL(row.net),
      formatNumber(row.transactionCount),
    ]),
    columns: [
      { width: CONTENT.widthMm - VALUE_WIDTH_MM * 3 - COUNT_WIDTH_MM },
      { width: VALUE_WIDTH_MM, align: "right" },
      { width: VALUE_WIDTH_MM, align: "right" },
      { width: VALUE_WIDTH_MM, align: "right" },
      { width: COUNT_WIDTH_MM, align: "right" },
    ],
    cellTextColor: (rowIndex, columnIndex) => {
      const row = rows[rowIndex];
      if (row == null) return undefined;
      if (columnIndex === 2) return row.totalOutflow === 0 ? undefined : COLORS.expense;
      if (columnIndex === 3 && isNegativeValue(row.net)) return COLORS.expense;
      return undefined;
    },
  });
};
