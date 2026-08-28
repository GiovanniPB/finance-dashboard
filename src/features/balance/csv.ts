/**
 * Exportação da matriz — mesma orientação da tela: um item por linha, um mês por
 * coluna, total na última. Com a variação ligada, cada mês leva uma coluna "Δ"
 * logo depois, também como na tela.
 */
import { toCsv } from "@/lib/csv";
import { formatMonthYear } from "@/lib/dates";

import type { BalanceMatrixLine } from "./compute";

function cell(value: number | null): string {
  return value == null ? "" : value.toFixed(2);
}

export interface BalanceCsvOptions {
  includeVariation?: boolean;
}

export function buildBalanceCsv(
  months: readonly string[],
  lines: readonly BalanceMatrixLine[],
  options: BalanceCsvOptions = {},
): string {
  const monthColumns = months.flatMap((month, index) => {
    const value = {
      key: month,
      header: formatMonthYear(month),
      getValue: (line: BalanceMatrixLine) => cell(line.values[index] ?? null),
    };
    if (!options.includeVariation) return [value];

    return [
      value,
      {
        key: `${month}__delta`,
        // A unidade varia por linha (% ou p.p.), então ela vai junto do valor em
        // vez do cabeçalho — senão a coluna diria uma coisa e a célula, outra.
        header: `Δ ${formatMonthYear(month)}`,
        getValue: (line: BalanceMatrixLine) => {
          const delta = line.deltas[index] ?? null;
          if (delta == null) return "";
          return `${delta.toFixed(2)}${line.deltaUnit === "points" ? " p.p." : "%"}`;
        },
      },
    ];
  });

  return toCsv<BalanceMatrixLine>(
    [...lines],
    [
      { key: "item", header: "Item", getValue: (line) => line.label },
      ...monthColumns,
      { key: "total", header: "Total", getValue: (line) => cell(line.total) },
    ],
  );
}
