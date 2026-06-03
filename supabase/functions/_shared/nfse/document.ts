/**
 * Validação de CPF/CNPJ (Deno-puro, sem deps).
 *
 * Cópia mínima de `src/lib/document.ts`: Edge Functions só podem importar de
 * dentro de `supabase/functions/`, então o validador vive aqui também. O
 * algoritmo de dígitos verificadores é estável — duplicação aceitável.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/gu, "");
}

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/u.test(cpf)) return false;

  const digits = cpf.split("").map(Number);
  for (let check = 9; check < 11; check++) {
    let sum = 0;
    for (let i = 0; i < check; i++) {
      sum += digits[i] * (check + 1 - i);
    }
    let mod = (sum * 10) % 11;
    if (mod === 10) mod = 0;
    if (mod !== digits[check]) return false;
  }
  return true;
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/u.test(cnpj)) return false;

  const digits = cnpj.split("").map(Number);
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const checkDigit = (weights: number[]): number => {
    const sum = weights.reduce((acc, w, i) => acc + digits[i] * w, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  if (checkDigit(weights1) !== digits[12]) return false;
  if (checkDigit(weights2) !== digits[13]) return false;
  return true;
}

/** Valida documento como CPF (11) ou CNPJ (14). Aceita com ou sem máscara. */
export function isValidDocument(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
}
