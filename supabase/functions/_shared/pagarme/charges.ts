/**
 * Cobrança (venda) do pagar.me normalizada para o **ledger de vendas**.
 *
 * Diferença em relação a `_shared/nfse/parse.ts`: aquele extrai o mínimo que a
 * NFS-e precisa (valor, tomador com endereço, split). Aqui extraímos o que a
 * ANÁLISE DE VENDA precisa — parcelas, meio de pagamento, bandeira, adquirente,
 * assinatura/pedido, status — inclusive de cobranças que **não** foram pagas
 * (necessário para taxa de aprovação).
 *
 * Três entradas convergem no mesmo normalizador:
 *  - `data` do webhook (`charge.paid`, `charge.payment_failed`, …);
 *  - item de `GET /charges` (a LISTA);
 *  - `GET /charges/{id}` (o detalhe).
 *
 * Achado da Fase 0 que simplifica o backfill: a LISTA já traz `customer`,
 * `paid_at` e `last_transaction` (com `installments` e `card`). O que falta nela é
 * `customer.address` e `split` — necessidades FISCAIS, não de venda. Logo o ledger
 * de vendas é populável pela lista, sem hidratar cobrança por cobrança
 * (~70 chamadas em vez de ~2.076 numa conta).
 */

import { pagarmeTimestamp } from "./time.ts";

export interface PagarmeCustomerRecord {
  customerId: string | null;
  name: string | null;
  email: string | null;
  document: string | null;
  documentType: string | null;
  createdAt: string | null;
}

export interface PagarmeChargeRecord {
  chargeId: string;
  code: string | null;
  orderId: string | null;
  invoiceId: string | null;
  subscriptionId: string | null;
  planId: string | null;
  customerId: string | null;

  status: string;
  paymentMethod: string | null;
  installments: number | null;
  amountCents: number;
  paidAmountCents: number | null;
  currency: string;

  chargeCreatedAt: string | null;
  paidAt: string | null;

  cardBrand: string | null;
  cardLastFour: string | null;
  acquirerName: string | null;
  recurrenceCycle: string | null;

  /** Comprador embutido na cobrança (para popular `pagarme_customers`). */
  customer: PagarmeCustomerRecord | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

/**
 * Normaliza um comprador. Serve tanto para o `customer` aninhado na cobrança
 * quanto para o `data` dos eventos `customer.created` / `customer.updated`, em
 * que o próprio payload É o cliente.
 */
export function parseCustomerRecord(raw: unknown): PagarmeCustomerRecord | null {
  const c = asRecord(raw);
  const customerId = asString(c.id);
  const name = asString(c.name);
  // sem id nem nome não há cliente utilizável
  if (!customerId && !name) return null;
  return {
    customerId,
    name,
    email: asString(c.email),
    document: asString(c.document),
    documentType: asString(c.document_type),
    createdAt: pagarmeTimestamp(c.created_at),
  };
}

/**
 * Normaliza UMA cobrança. `null` quando não há `id` (nada aproveitável).
 *
 * Diferente do parser fiscal, **não** exige `status === 'paid'` nem valor > 0:
 * cobrança recusada é dado de funil e entra no ledger.
 */
export function parseChargeRecord(raw: unknown): PagarmeChargeRecord | null {
  const charge = asRecord(raw);
  const chargeId = asString(charge.id);
  if (!chargeId) return null;

  const lastTx = asRecord(charge.last_transaction);
  const card = asRecord(lastTx.card);
  const invoice = asRecord(charge.invoice);
  const order = asRecord(charge.order);
  const customer = parseCustomerRecord(charge.customer);

  return {
    chargeId,
    code: asString(charge.code),
    orderId: asString(order.id),
    invoiceId: asString(invoice.id),
    // a assinatura vem aninhada na invoice do ciclo (camelCase na API, não snake)
    subscriptionId: asString(invoice.subscriptionId) ?? asString(charge.subscription_id),
    planId: asString(charge.plan_id) ?? asString(asRecord(invoice.plan).id),
    customerId: customer?.customerId ?? asString(charge.customer_id),

    status: asString(charge.status) ?? "unknown",
    paymentMethod: asString(charge.payment_method),
    installments: asInt(lastTx.installments),
    amountCents: typeof charge.amount === "number" ? charge.amount : 0,
    paidAmountCents: typeof charge.paid_amount === "number" ? charge.paid_amount : null,
    currency: asString(charge.currency) ?? "BRL",

    chargeCreatedAt: pagarmeTimestamp(charge.created_at),
    // em algumas formas de charge só a transação traz o pagamento
    paidAt: pagarmeTimestamp(charge.paid_at) ?? pagarmeTimestamp(lastTx.paid_at),

    cardBrand: asString(card.brand),
    cardLastFour: asString(card.last_four_digits),
    acquirerName: asString(lastTx.acquirer_name),
    recurrenceCycle: asString(charge.recurrence_cycle),

    customer,
  };
}

export interface ChargesListPage {
  charges: PagarmeChargeRecord[];
  /** Itens brutos na página (0 ⇒ fim da paginação). */
  count: number;
  /** `paging.total` quando informado. O `/charges` informa; o `/payables` não. */
  total: number | null;
  /** Há próxima página? (`paging.next`) */
  hasNext: boolean;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const env = asRecord(value);
  if (Array.isArray(env.data)) return env.data;
  return [];
}

/**
 * Resposta de `GET /charges` -> página normalizada.
 *
 * O tamanho de página é **capado em 30** pelo pagar.me (pedir 50 devolve 30 —
 * reconfirmado na Fase 0), então quem pagina deve usar 30 para que
 * `page × size` não pule registros.
 */
export function parseChargesListPage(response: unknown): ChargesListPage {
  const items = asArray(response);
  const charges: PagarmeChargeRecord[] = [];
  for (const item of items) {
    const charge = parseChargeRecord(item);
    if (charge) charges.push(charge);
  }

  const paging = asRecord(asRecord(response).paging);
  const total = typeof paging.total === "number" ? paging.total : null;

  return {
    charges,
    count: items.length,
    total,
    hasNext: typeof paging.next === "string" && paging.next.length > 0,
  };
}

/** Tamanho de página do `GET /charges` — cap real da API. */
export const CHARGES_PAGE_SIZE = 30;
