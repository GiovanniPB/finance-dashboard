/**
 * Currency utilities for BRL input masking.
 * Internal representation: number with up to 2 decimals (matches numeric(18,2)).
 * Display representation: "1.234,56" without the R$ prefix (the prefix is rendered visually).
 */

const formatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Number → "1.234,56" (or empty string for nullish/NaN). */
export function formatCurrencyInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return formatter.format(value);
}

/**
 * Raw user input → number with 2 decimals.
 * Strategy: keep only digits, treat as centavos, divide by 100.
 * "1234,56" with current input "12345" becomes 123.45.
 */
export function parseCurrencyInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return 0;
  const asCents = Number.parseInt(digits, 10);
  if (!Number.isFinite(asCents)) return 0;
  return asCents / 100;
}
