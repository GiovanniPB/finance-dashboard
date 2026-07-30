import type { LedgerEntry } from "./api";

export interface BalancePoint {
  /** ISO YYYY-MM-DD */
  date: string;
  /** Saldo ao fim do dia. */
  balance: number;
  inflow: number;
  outflow: number;
}

/**
 * Condensa o extrato numa série diária de saldo, para o gráfico.
 *
 * Dias com vários lançamentos viram um ponto só — o saldo ao fim do dia, que é
 * o `running_balance` da última linha daquele dia. Assume `entries` já ordenado
 * por data, como a RPC devolve.
 *
 * O saldo de abertura entra como primeiro ponto, exceto quando já há movimento
 * no próprio dia inicial (aí o ponto do dia já representa o fechamento dele).
 */
export function toBalanceSeries(
  entries: LedgerEntry[],
  openingBalance: number,
  from: string,
): BalancePoint[] {
  const byDate = new Map<string, BalancePoint>();

  for (const entry of entries) {
    const previous = byDate.get(entry.cash_date);
    byDate.set(entry.cash_date, {
      date: entry.cash_date,
      // entries estão em ordem, então a última linha do dia é o fechamento
      balance: entry.running_balance,
      inflow: (previous?.inflow ?? 0) + (entry.direction === "inflow" ? entry.amount : 0),
      outflow: (previous?.outflow ?? 0) + (entry.direction === "outflow" ? entry.amount : 0),
    });
  }

  const days = Array.from(byDate.values());
  if (byDate.has(from)) return days;

  return [{ date: from, balance: openingBalance, inflow: 0, outflow: 0 }, ...days];
}

/** Menor e maior saldo da série — usado para marcar o pico e o vale no gráfico. */
export function balanceRange(points: BalancePoint[]): { min: number; max: number } | null {
  if (points.length === 0) return null;
  return points.reduce(
    (acc, p) => ({ min: Math.min(acc.min, p.balance), max: Math.max(acc.max, p.balance) }),
    { min: points[0].balance, max: points[0].balance },
  );
}
