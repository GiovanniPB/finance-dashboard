/**
 * Money helpers — armazenamos como numeric(18,2) no Postgres e operamos como
 * inteiros em centavos sempre que precisamos somar/subtrair com precisão.
 * Use estas helpers para evitar bugs de ponto flutuante.
 */

export type Cents = number;

export function toCents(value: number | string): Cents {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

export function addCents(...values: (number | string)[]): number {
  const total = values.reduce<number>((acc, v) => acc + toCents(v), 0);
  return fromCents(total);
}

export function subCents(a: number | string, b: number | string): number {
  return fromCents(toCents(a) - toCents(b));
}

/** Para a UI: sinaliza positivo/negativo sem perder precisão. */
export function signed(value: number, direction: "inflow" | "outflow"): number {
  return direction === "inflow" ? value : -value;
}
