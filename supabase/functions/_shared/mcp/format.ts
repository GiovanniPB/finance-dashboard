/**
 * Formatação e mascaramento de saída.
 *
 * Formatador de moeda escrito à mão de propósito: `Intl.NumberFormat` varia entre
 * runtimes (Deno, Node, happy-dom) até no caractere de espaço, e isso vira teste
 * intermitente. Aqui o resultado é o mesmo em qualquer lugar.
 */

/** PostgREST devolve `numeric` como string. Converte sem perder centavo. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** 1234.5 -> "R$ 1.234,50" (negativo: "-R$ 1.234,50"). */
export function brl(value: unknown): string {
  const n = toNumber(value);
  const negativo = n < 0;
  const [inteiro, centavos] = Math.abs(n).toFixed(2).split(".");
  const comSeparador = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${comSeparador},${centavos}`;
}

/**
 * Mascara documento de PESSOA FÍSICA. CNPJ passa inteiro.
 *
 * O CPF é PII e não tem serventia analítica — mascarado sempre. O CNPJ é dado
 * público de pessoa jurídica na Receita, e é justamente ele que identifica o
 * fornecedor/cliente numa análise; mascarar custaria utilidade e não protegeria
 * ninguém.
 */
export function maskDocument(doc: unknown): string | null {
  if (typeof doc !== "string") return null;
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 11) {
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  }
  return doc.trim() === "" ? null : "***";
}

/** Trunca texto livre (descrição de lançamento) para não estourar o contexto. */
export function truncate(value: unknown, max = 120): string {
  if (typeof value !== "string") return "";
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
