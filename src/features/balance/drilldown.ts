/**
 * Tradução do drilldown de uma linha para filtro de consulta — puro, para o
 * caso chato (o "Não classificado") ficar testável sem banco.
 */
import type { Enums } from "@/lib/supabase";

import type { BalanceDrilldown } from "./compute";
import type { BalanceMeasure } from "./schema";

export type AccountingBasis = Enums["accounting_basis"];

export const BASIS_LABELS: Record<AccountingBasis, string> = {
  accrual: "Competência",
  cash: "Caixa",
};

/**
 * Os filtros de cada regime, iguais aos da RPC da série e aos da DRE. Se estes
 * conjuntos divergirem, a lista de lançamentos deixa de somar o valor da célula
 * que o usuário clicou — é a única coisa que essa gaveta promete.
 */
export const STATUSES_BY_BASIS: Record<AccountingBasis, readonly Enums["transaction_status"][]> = {
  // Competência: o fato ocorreu, receber ou pagar é outra questão.
  accrual: ["settled", "reconciled", "pending"],
  // Caixa: só o que transitou. `pending` não tem data de caixa e cai fora sozinho.
  cash: ["settled", "reconciled"],
};

/** A data que define em que mês o lançamento cai — muda com o regime. */
export const DATE_COLUMN_BY_BASIS: Record<AccountingBasis, "accrual_date" | "cash_date"> = {
  accrual: "accrual_date",
  cash: "cash_date",
};

/**
 * Lado do dinheiro que a medida da linha soma. `null` = os dois.
 *
 * Sem isso a lista mostraria lançamentos que não entram no número: uma linha
 * "Saídas" que exibe também as entradas daquele centro não fecha com a célula.
 */
export function directionForMeasure(measure: BalanceMeasure): "inflow" | "outflow" | null {
  if (measure === "revenue") return "inflow";
  if (measure === "expense") return "outflow";
  return null;
}

/** `cost_center_id` fora da lista **ou** nulo — `not.in` sozinho não pega nulo. */
function sideFilter(direction: "inflow" | "outflow", covered: readonly string[]): string {
  if (covered.length === 0) return `direction.eq.${direction}`;
  const list = covered.map((id) => `"${id}"`).join(",");
  return `and(direction.eq.${direction},or(cost_center_id.is.null,cost_center_id.not.in.(${list})))`;
}

/**
 * Filtro do "Não classificado", no formato que o `.or()` do supabase-js espera.
 *
 * A cobertura é por lado, então os dois lados são consultados separadamente: uma
 * entrada só é "não classificada" se o centro dela não estiver coberto **para
 * entrada**, e o mesmo para saída. Lançamento sem centro nenhum entra pelos dois.
 */
export function unclassifiedOrFilter(drilldown: {
  revenueCovered: readonly string[];
  expenseCovered: readonly string[];
}): string {
  return [
    sideFilter("inflow", drilldown.revenueCovered),
    sideFilter("outflow", drilldown.expenseCovered),
  ].join(",");
}

/** Resumo em uma linha do que a lista está mostrando, para o cabeçalho da gaveta. */
export function describeDrilldown(drilldown: BalanceDrilldown, costCenterCount: number): string {
  if (drilldown.kind === "unclassified") {
    return "Lançamentos que nenhum item do modelo captura";
  }
  const centers =
    costCenterCount === 1 ? "1 centro de custo" : `${costCenterCount} centros de custo`;
  const side =
    drilldown.measure === "revenue"
      ? "só entradas"
      : drilldown.measure === "expense"
        ? "só saídas"
        : "entradas e saídas";
  return `${centers} · ${side}`;
}
