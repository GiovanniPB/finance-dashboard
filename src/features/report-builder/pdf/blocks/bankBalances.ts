/**
 * Saldos bancários ao fim do período.
 *
 * O saldo de fechamento vem calculado do banco (`initial_balance + inflow −
 * outflow`); não recalculamos aqui para não divergir da tela de contas.
 */
import { formatBRL } from "@/lib/format";

import type { BlockRenderer } from "../driver";
import { COLORS, CONTENT } from "../reportTheme";
import { renderEmptyBlock } from "./chartBlock";
import { formatOutflow, isNegativeValue } from "./shared";
import { renderTableBlock } from "./table";

const VALUE_WIDTH_MM = 30;

export const renderBankBalances: BlockRenderer = (ctx, block) => {
  const rows = ctx.data.bankBalances;
  const heading = block.options.heading ?? "Saldos bancários";

  if (rows == null || rows.length === 0) {
    renderEmptyBlock(
      ctx,
      heading,
      ctx.period.label,
      ctx.config.scope.mode === "consolidated"
        ? "Saldos bancários não têm versão consolidada — selecione uma empresa."
        : "Nenhuma conta bancária cadastrada.",
    );
    return;
  }

  const total = rows.reduce((acc, row) => acc + row.closing_balance, 0);

  renderTableBlock(ctx, {
    heading,
    eyebrow: `posição em ${ctx.period.to.split("-").reverse().join("/")}`,
    head: [["Conta", "Entradas", "Saídas", "Saldo"]],
    body: rows.map((row) => [
      accountLabel(row.bank_name, row.nickname),
      formatBRL(row.inflow),
      formatOutflow(row.outflow),
      formatBRL(row.closing_balance),
    ]),
    foot: [["Total", "", "", formatBRL(total)]],
    columns: [
      { width: CONTENT.widthMm - VALUE_WIDTH_MM * 3 },
      { width: VALUE_WIDTH_MM, align: "right" },
      { width: VALUE_WIDTH_MM, align: "right" },
      { width: VALUE_WIDTH_MM, align: "right" },
    ],
    cellTextColor: (rowIndex, columnIndex) => {
      const row = rows[rowIndex];
      if (row == null) return undefined;
      if (columnIndex === 2) return row.outflow === 0 ? undefined : COLORS.expense;
      if (columnIndex === 3 && isNegativeValue(row.closing_balance)) return COLORS.expense;
      return undefined;
    },
  });
};

function accountLabel(bankName: string, nickname: string): string {
  if (nickname === "" || nickname === bankName) return bankName;
  return `${bankName} · ${nickname}`;
}
