/**
 * Payables (recebíveis) do pagar.me — parsing COMPLETO.
 *
 * `_shared/nfse/payables.ts` já consultava `GET /payables?charge_id=`, mas só
 * agregava o valor bruto por recebedor (era tudo que o split fiscal precisava) e
 * **descartava o resto do payload**. O resto do payload é o cronograma de
 * recebíveis: cada parcela, com data de liquidação, taxa e status.
 *
 * Contrato confirmado contra a API de produção em 12/08/2026 — ver
 * `docs/integrations/pagarme-api-contract.md`. Campos observados:
 *
 *   id, status, amount, fee, anticipation_fee, fraud_coverage_fee, installment,
 *   gateway_id, charge_id, recipient_id, payment_date, type, payment_method,
 *   accrual_at, created_at, liquidation_arrangement_id (só quando liquidado)
 *
 * Duas formas de entrada convergem no mesmo normalizador:
 *  - itens de `GET /payables?charge_id=` (a fila de recebíveis da venda);
 *  - `movement_object` de `GET /balance/operations` (a realização da liquidação),
 *    que tem o mesmo shape **mais** `split_id`, e devolve `id`/`gateway_id` como
 *    STRING onde `/payables` devolve NUMBER.
 *
 * Puro e defensivo: entrada não-confiável -> narrowing seguro. Sem I/O (o fetch
 * fica na Edge Function).
 */

import { pagarmeTimestamp, saoPauloDate } from "./time.ts";

/**
 * Tipos de payable que somam ao recebedor (entrada de dinheiro).
 * Mantidos como conjunto aberto: `type` desconhecido é IGNORADO na agregação,
 * nunca somado por engano.
 */
const CREDIT_TYPES = new Set(["credit"]);

/** Tipos que subtraem (saída de dinheiro: devolução ao cliente / disputa perdida). */
const DEBIT_TYPES = new Set(["refund", "chargeback"]);

/** Payable normalizado. Valores monetários em **centavos** (inteiros). */
export interface PagarmePayable {
  /** id do payable — sempre string (a API alterna number/string por endpoint). */
  id: string | null;
  chargeId: string | null;
  recipientId: string | null;
  /** `waiting_funds` | `paid` | `suspended` | … (conjunto aberto) */
  status: string | null;
  /** `credit` | `refund` | `chargeback` | … (conjunto aberto) */
  type: string | null;
  /** Número da parcela (1..N). Null em payable não parcelado. */
  installment: number | null;
  /** Valor BRUTO da parcela para este recebedor. */
  amountCents: number;
  feeCents: number;
  anticipationFeeCents: number;
  fraudCoverageFeeCents: number;
  /** Bruto menos todas as taxas — o que de fato entra na conta. */
  netCents: number;
  /**
   * Bruto com sinal: positivo para crédito, negativo para estorno/chargeback.
   * `0` para `type` desconhecido (não presume direção do dinheiro).
   */
  signedAmountCents: number;
  /** Instante ISO UTC da liquidação (prevista enquanto `waiting_funds`). */
  paymentDate: string | null;
  /** Data civil da liquidação em São Paulo (`YYYY-MM-DD`) — usar em coluna `date`. */
  settlementDate: string | null;
  /** Instante ISO UTC da venda (competência no pagar.me). */
  accrualAt: string | null;
  createdAt: string | null;
  paymentMethod: string | null;
  gatewayId: string | null;
  /** `la_…` — presente SÓ quando liquidado; é o marcador confiável de liquidação. */
  liquidationArrangementId: string | null;
  /** `sr_…` — só vem via `/balance/operations`; `/payables` não devolve. */
  splitId: string | null;
  /** Liquidado de fato (status `paid`). */
  isSettled: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  // /balance/operations devolve id/gateway_id como string e /payables como
  // number — normalizamos os dois para string em vez de escolher um.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asCents(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asInstallment(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  // defensivo: a API pode passar a serializar como string
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number.parseInt(value, 10);
    return n >= 1 ? n : null;
  }
  return null;
}

/** `recipient_id` direto ou aninhado em `recipient.id` (formas distintas da API). */
function recipientOf(p: Record<string, unknown>): string | null {
  const direct = asString(p.recipient_id);
  if (direct) return direct;
  const nested = asRecord(p.recipient);
  return nested ? asString(nested.id) : null;
}

function signOf(type: string | null, amountCents: number): number {
  if (type && CREDIT_TYPES.has(type)) return Math.abs(amountCents);
  if (type && DEBIT_TYPES.has(type)) return -Math.abs(amountCents);
  return 0;
}

/** Normaliza UM payable (item de `/payables` ou `movement_object`). */
export function parsePayable(raw: unknown): PagarmePayable | null {
  const p = asRecord(raw);
  if (!p) return null;

  const type = asString(p.type);
  const amountCents = asCents(p.amount);
  const feeCents = asCents(p.fee);
  const anticipationFeeCents = asCents(p.anticipation_fee);
  const fraudCoverageFeeCents = asCents(p.fraud_coverage_fee);
  const status = asString(p.status);
  const paymentDate = pagarmeTimestamp(p.payment_date);

  return {
    id: asString(p.id),
    chargeId: asString(p.charge_id),
    recipientId: recipientOf(p),
    status,
    type,
    installment: asInstallment(p.installment),
    amountCents,
    feeCents,
    anticipationFeeCents,
    fraudCoverageFeeCents,
    netCents: amountCents - feeCents - anticipationFeeCents - fraudCoverageFeeCents,
    signedAmountCents: signOf(type, amountCents),
    paymentDate,
    settlementDate: saoPauloDate(p.payment_date),
    // `accrual_at` (não `accrual_date`, como a doc pública sugere)
    accrualAt: pagarmeTimestamp(p.accrual_at),
    createdAt: pagarmeTimestamp(p.created_at),
    paymentMethod: asString(p.payment_method),
    gatewayId: asString(p.gateway_id),
    liquidationArrangementId: asString(p.liquidation_arrangement_id),
    splitId: asString(p.split_id),
    isSettled: status === "paid",
  };
}

/** Aceita `{ data: [...] }` (envelope da API) ou um array cru. */
function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const env = asRecord(value);
  if (env && Array.isArray(env.data)) return env.data;
  return [];
}

/**
 * Resposta de `GET /payables?charge_id=` -> lista completa normalizada.
 * Preserva a ordem da API; itens irreconhecíveis são descartados.
 */
export function parsePayablesDetailed(response: unknown): PagarmePayable[] {
  const out: PagarmePayable[] = [];
  for (const item of asArray(response)) {
    const payable = parsePayable(item);
    if (payable) out.push(payable);
  }
  return out;
}

/**
 * Resposta de `GET /balance/operations` -> payables das operações de liquidação.
 *
 * A operação embrulha o payable em `movement_object` (com `object: "payable"`).
 * Operações de outro tipo (ex.: transferência) são ignoradas aqui.
 */
export function parseBalanceOperationPayables(response: unknown): PagarmePayable[] {
  const out: PagarmePayable[] = [];
  for (const item of asArray(response)) {
    const op = asRecord(item);
    if (!op) continue;
    const movement = asRecord(op.movement_object);
    if (!movement) continue;
    // `object` marca o que é o movimento; `type` no nível da operação também
    // diz "payable", então aceitamos qualquer um dos dois.
    const isPayable = movement.object === "payable" || op.type === "payable";
    if (!isPayable) continue;
    const payable = parsePayable(movement);
    if (payable) out.push(payable);
  }
  return out;
}

/**
 * Soma o BRUTO com sinal por recebedor (crédito − estorno/chargeback).
 *
 * Bruto, não líquido, de propósito: é assim que a soma fecha contra o valor pago
 * da cobrança — a validação que o split fiscal faz. Ordem de inserção = ordem de
 * aparição na resposta.
 */
export function aggregateGrossByRecipient(payables: PagarmePayable[]): Map<string, number> {
  const byRecipient = new Map<string, number>();
  for (const p of payables) {
    if (!p.recipientId) continue;
    // `type` desconhecido tem signed 0 e não deve criar entrada para o recebedor
    if (p.signedAmountCents === 0 && !isKnownType(p.type)) continue;
    byRecipient.set(p.recipientId, (byRecipient.get(p.recipientId) ?? 0) + p.signedAmountCents);
  }
  return byRecipient;
}

function isKnownType(type: string | null): boolean {
  return !!type && (CREDIT_TYPES.has(type) || DEBIT_TYPES.has(type));
}

/** Soma dos brutos com sinal (centavos) — para validar contra o valor pago. */
export function totalGrossCents(payables: PagarmePayable[]): number {
  return payables.reduce((acc, p) => acc + p.signedAmountCents, 0);
}

/** Soma das taxas (MDR + antecipação + cobertura de fraude), em centavos. */
export function totalFeesCents(payables: PagarmePayable[]): number {
  return payables.reduce(
    (acc, p) => acc + p.feeCents + p.anticipationFeeCents + p.fraudCoverageFeeCents,
    0,
  );
}
