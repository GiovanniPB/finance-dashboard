/** CPF/CNPJ validation and formatting helpers (Brazilian tax documents). */

/** Remove all non-digit characters. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/gu, "");
}

/** Validate a CPF (11 digits) including its check digits. */
export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  // Reject sequences of the same digit (e.g. 00000000000).
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

/** Validate a CNPJ (14 digits) including its check digits. */
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

/**
 * Validate a document as CPF (11 digits) or CNPJ (14 digits).
 * Accepts values with or without mask characters.
 */
export function isValidDocument(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
}

/** Format a CPF/CNPJ string with the conventional Brazilian mask. */
export function formatDocument(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/^(\d{3})(\d)/u, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/u, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/u, "$1.$2.$3-$4");
  }
  // CNPJ: 00.000.000/0000-00
  return digits
    .replace(/^(\d{2})(\d)/u, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/u, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/u, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/u, "$1.$2.$3/$4-$5");
}
