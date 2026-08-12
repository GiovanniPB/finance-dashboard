/**
 * Conversão de dinheiro do pagar.me para o banco.
 *
 * A API fala **centavos inteiros** (`1490` = R$ 14,90); as colunas do Postgres são
 * `numeric(18,2)` em **reais**. A conversão devolve **string** com 2 decimais, não
 * number, de propósito: `numeric` é exato e string atravessa JSON/PostgREST sem
 * passar por float binário. `(1490/100).toFixed(2)` = `"14.90"` chega ao Postgres
 * como o valor exato; um float poderia serializar como `14.900000000000001`.
 */

/** Centavos inteiros -> string decimal em reais (`"14.90"`). */
export function centsToReais(cents: unknown): string {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return (n / 100).toFixed(2);
}

/** Idem, mas devolve null quando o valor não veio (para coluna nullable). */
export function centsToReaisOrNull(cents: unknown): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return (cents / 100).toFixed(2);
}
