import type { SalesBreakdownRow } from "../../api";

/**
 * Regras puras dos cards de composição — rótulo e ordenação.
 *
 * Separadas dos componentes porque são o que de fato tem regra (e o que pode
 * quebrar em silêncio quando o pagar.me devolver um valor novo).
 */

/**
 * A API devolve o valor cru do gateway (`credit_card`). Mostrar isso na tela
 * vazava o vocabulário do pagar.me para o usuário final.
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  pix: "Pix",
  boleto: "Boleto",
  voucher: "Voucher",
  bank_transfer: "Transferência",
  desconhecido: "Desconhecido",
};

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "Amex",
  hipercard: "Hipercard",
  diners: "Diners",
  discover: "Discover",
  aura: "Aura",
  jcb: "JCB",
  "não-cartão": "Não-cartão",
};

function capitalize(v: string): string {
  return v.length === 0 ? v : v[0].toUpperCase() + v.slice(1);
}

/** Valor desconhecido cai no fallback legível em vez de sumir da tela. */
export function paymentMethodLabel(raw: string): string {
  return PAYMENT_METHOD_LABELS[raw] ?? capitalize(raw.replace(/_/gu, " "));
}

export function brandLabel(raw: string): string {
  return BRAND_LABELS[raw.toLowerCase()] ?? capitalize(raw.replace(/_/gu, " "));
}

/**
 * Ordem do parcelamento a partir do rótulo que a RPC devolve ("à vista", "2x"…).
 *
 * Existe porque parcelamento é ORDINAL: ranquear por valor — como o card único
 * fazia — embaralhava 1x…12x e escondia o padrão de financiamento. Rótulo não
 * reconhecido vai para o fim, nunca para o meio da sequência.
 */
export function installmentOrder(label: string): number {
  if (label === "à vista") return 1;
  const m = /^(\d+)x$/u.exec(label);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

export function sumAmount(rows: SalesBreakdownRow[] | undefined): number {
  return (rows ?? []).reduce((acc, r) => acc + r.amount, 0);
}
