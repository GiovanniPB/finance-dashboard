/**
 * Assinatura do pagar.me normalizada, com **MRR** derivado.
 *
 * Contexto medido na Fase 0: só a conta da Jimmy usa assinatura (156 de 182
 * eventos); a da RCO não tem nenhuma — vende contrato anual como pedido avulso
 * parcelado. Este módulo cobre o caso "assinatura"; a receita recorrente da RCO é
 * derivada do cronograma de recebíveis, não daqui.
 *
 * O caso real da Jimmy: plano "Completo Anual", `interval: year`,
 * `interval_count: 1`, valor de ciclo R$ 4.764,00, cobrado em 12x. O MRR
 * normalizado (4764 ÷ 12 = R$ 397,00) coincide exatamente com o valor de cada
 * parcela dos payables — os dois lados do sistema fecham.
 */

import { centsToReaisOrNull } from "./money.ts";
import { pagarmeTimestamp } from "./time.ts";

export interface PagarmeSubscriptionRecord {
  subscriptionId: string;
  code: string | null;
  customerId: string | null;
  planId: string | null;
  planName: string | null;

  status: string | null;
  interval: string | null;
  intervalCount: number | null;
  billingType: string | null;
  paymentMethod: string | null;
  installments: number | null;

  startAt: string | null;
  nextBillingAt: string | null;
  canceledAt: string | null;
  currentCycleStart: string | null;
  currentCycleEnd: string | null;

  /** Valor total do ciclo, em centavos (soma dos itens). */
  cycleAmountCents: number | null;
  /** Receita mensal recorrente, em reais (string p/ `numeric`). Null se indeterminável. */
  mrr: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

/**
 * Quantos MESES um ciclo cobre. `month`/`year` são exatos (os únicos em uso);
 * `day`/`week` usam a média de 30,44 dias por mês — aproximação assumida, já que
 * não existe conversão exata de semana para mês.
 */
export function cycleMonths(interval: string | null, intervalCount: number | null): number | null {
  const count = intervalCount && intervalCount > 0 ? intervalCount : 1;
  switch (interval) {
    case "month":
      return count;
    case "year":
      return count * 12;
    case "week":
      return (count * 7) / 30.44;
    case "day":
      return count / 30.44;
    default:
      return null;
  }
}

/** Soma `quantity × pricing_scheme.price` dos itens, em centavos. */
function sumItemsCents(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  let total = 0;
  let sawPrice = false;
  for (const item of raw) {
    const it = asRecord(item);
    // item cancelado não compõe a receita corrente
    if (asString(it.status) === "deleted") continue;
    const price = asRecord(it.pricing_scheme).price;
    if (typeof price !== "number" || !Number.isFinite(price)) continue;
    const quantity = asInt(it.quantity) ?? 1;
    total += price * quantity;
    sawPrice = true;
  }
  return sawPrice ? total : null;
}

/** Normaliza uma assinatura. `null` sem `id`. */
export function parseSubscriptionRecord(raw: unknown): PagarmeSubscriptionRecord | null {
  const sub = asRecord(raw);
  const subscriptionId = asString(sub.id);
  if (!subscriptionId) return null;

  const plan = asRecord(sub.plan);
  const cycle = asRecord(sub.current_cycle);
  const interval = asString(sub.interval) ?? asString(plan.interval);
  const intervalCount = asInt(sub.interval_count) ?? asInt(plan.interval_count);

  const cycleAmountCents = sumItemsCents(sub.items);
  const months = cycleMonths(interval, intervalCount);
  // MRR só existe se soubermos valor do ciclo E duração do ciclo
  const mrr =
    cycleAmountCents !== null && months !== null && months > 0
      ? centsToReaisOrNull(Math.round(cycleAmountCents / months))
      : null;

  return {
    subscriptionId,
    code: asString(sub.code),
    customerId: asString(asRecord(sub.customer).id),
    planId: asString(plan.id),
    planName: asString(plan.name),

    status: asString(sub.status),
    interval,
    intervalCount,
    billingType: asString(sub.billing_type) ?? asString(plan.billing_type),
    paymentMethod: asString(sub.payment_method),
    installments: asInt(sub.installments),

    startAt: pagarmeTimestamp(sub.start_at),
    nextBillingAt: pagarmeTimestamp(sub.next_billing_at),
    // só aparece quando a assinatura é cancelada
    canceledAt: pagarmeTimestamp(sub.canceled_at),
    currentCycleStart: pagarmeTimestamp(cycle.start_at),
    currentCycleEnd: pagarmeTimestamp(cycle.end_at),

    cycleAmountCents,
    mrr,
  };
}

export interface SubscriptionsListPage {
  subscriptions: PagarmeSubscriptionRecord[];
  count: number;
  total: number | null;
  hasNext: boolean;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const env = asRecord(value);
  return Array.isArray(env.data) ? env.data : [];
}

/**
 * Resposta de `GET /subscriptions` -> página normalizada.
 * Página **vazia é caso normal** (a conta da RCO não tem assinatura), não erro.
 */
export function parseSubscriptionsListPage(response: unknown): SubscriptionsListPage {
  const items = asArray(response);
  const subscriptions: PagarmeSubscriptionRecord[] = [];
  for (const item of items) {
    const sub = parseSubscriptionRecord(item);
    if (sub) subscriptions.push(sub);
  }

  const paging = asRecord(asRecord(response).paging);
  return {
    subscriptions,
    count: items.length,
    total: typeof paging.total === "number" ? paging.total : null,
    hasNext: typeof paging.next === "string" && paging.next.length > 0,
  };
}
