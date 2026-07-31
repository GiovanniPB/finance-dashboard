/**
 * Parsing do pagar.me -> `ChargePaidEvent` normalizado. Puro e defensivo
 * (entrada não-confiável -> narrowing seguro). Duas entradas convergem no mesmo
 * núcleo (`buildEvent`), garantindo mapeamento idêntico:
 *
 *  - `parseChargePaidWebhook(payload)` — envelope v5 do webhook
 *    `{ id, type, created_at, account, data: <charge> }`.
 *  - `parseChargeResource(charge, eventId)` — objeto de DETALHE de
 *    `GET /charges/{id}` (usado pelo backfill; a lista `GET /charges` é magra —
 *    não traz `customer.address` nem `split`, por isso hidratamos pelo detalhe).
 *
 * Em ambos, o split fica em `charge.last_transaction.split[]` (com `recipient`
 * aninhado), aceitando `charge.split[]` como fallback. O split AUTORITATIVO,
 * porém, vem depois de `/payables` (ver `payables.ts`); este é o de partida.
 */

import type { ChargePaidEvent, PagarmeAddress, PagarmeSplit } from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseSplit(charge: Record<string, unknown>): PagarmeSplit[] {
  const lastTx = asRecord(charge.last_transaction);
  const raw = Array.isArray(charge.split)
    ? charge.split
    : Array.isArray(lastTx.split)
      ? lastTx.split
      : [];

  const out: PagarmeSplit[] = [];
  for (const item of raw as unknown[]) {
    const entry = asRecord(item);
    // No charge.paid real o recebedor vem aninhado: split[].recipient.id (re_...).
    // Mantemos fallback para recipient_id (outras formas de evento).
    const recipientId = asString(asRecord(entry.recipient).id) ?? asString(entry.recipient_id);
    if (!recipientId) continue;
    out.push({
      recipientId,
      amount: typeof entry.amount === "number" ? entry.amount : 0,
      type: entry.type === "flat" ? "flat" : "percentage",
    });
  }
  return out;
}

/** Tem sufixo de fuso ("Z" ou ±hh:mm)? */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Data do pagar.me -> instante ISO UTC. O payload real vem **sem** offset
 * (`"2026-07-31T14:32:54"`) e a API documenta UTC; sem carimbar o fuso, o
 * `new Date` do runtime interpretaria a string como hora local e deslocaria a
 * data em até um dia nas pontas. Retorna null para ausente/inválida.
 */
export function pagarmeTimestamp(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const iso = HAS_OFFSET.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function parseAddress(customer: Record<string, unknown>): PagarmeAddress | null {
  if (!customer.address || typeof customer.address !== "object") return null;
  const a = customer.address as Record<string, unknown>;
  return {
    line_1: asString(a.line_1),
    line_2: asString(a.line_2),
    zip_code: asString(a.zip_code),
    city: asString(a.city),
    state: asString(a.state),
    country: asString(a.country),
  };
}

/**
 * Núcleo puro: objeto `charge` (do webhook OU do detalhe da API) -> evento
 * normalizado. `null` se a cobrança não tem id ou valor > 0.
 */
function buildEvent(charge: Record<string, unknown>, eventId: string): ChargePaidEvent | null {
  const chargeId = asString(charge.id);
  const amount = typeof charge.amount === "number" ? charge.amount : 0;
  if (!chargeId || amount <= 0) return null;

  const customer = asRecord(charge.customer);
  const invoice = asRecord(charge.invoice);

  return {
    eventId,
    chargeId,
    amountCents: amount,
    chargeCreatedAt: pagarmeTimestamp(charge.created_at),
    // paid_at é a data do pagamento; em algumas formas de charge só a transação
    // a traz, e sem nenhuma das duas fica null (não inventa a data da fila)
    paidAt:
      pagarmeTimestamp(charge.paid_at) ??
      pagarmeTimestamp(asRecord(charge.last_transaction).paid_at),
    planId: asString(charge.plan_id), // ausente no charge.paid (só invoice.subscriptionId)
    subscriptionId: asString(invoice.subscriptionId),
    customer: {
      name: asString(customer.name),
      email: asString(customer.email),
      document: asString(customer.document),
      address: parseAddress(customer),
    },
    split: parseSplit(charge),
  };
}

/**
 * Converte o payload do webhook (JSON já parseado) em `ChargePaidEvent`.
 * Retorna `null` se não for um `charge.paid` válido (o handler ignora/200).
 */
export function parseChargePaidWebhook(payload: Record<string, unknown>): ChargePaidEvent | null {
  const eventId = asString(payload.id);
  if (!eventId || payload.type !== "charge.paid") return null;
  return buildEvent(asRecord(payload.data), eventId);
}

/**
 * Converte o objeto de DETALHE de `GET /charges/{id}` (backfill) em evento.
 * Só cobrança **paga** vira nota — `null` caso contrário (rede de segurança;
 * a enumeração já filtra `status=paid`). `eventId` é a procedência sintética do
 * backfill (ex.: `backfill:<chargeId>`), gravada em `metadata.sourceEventId`.
 */
export function parseChargeResource(
  charge: Record<string, unknown>,
  eventId: string,
): ChargePaidEvent | null {
  const c = asRecord(charge);
  if (c.status !== "paid") return null;
  const id = asString(eventId);
  if (!id) return null;
  return buildEvent(c, id);
}
