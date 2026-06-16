/**
 * Parsing do webhook BRUTO do pagar.me (`charge.paid`) -> `ChargePaidEvent`
 * normalizado. Puro e defensivo (entrada não-confiável -> narrowing seguro).
 *
 * Envelope v5: { id, type, created_at, account, data: <recurso> }. Para eventos
 * `charge.*`, `data` é o objeto charge. O split fica em
 * `data.last_transaction.split[]` (modelo de domínio do pagar.me); aceitamos
 * também `data.split[]` como fallback.
 *
 * ⚠️ FASE 2: confirmar a forma exata contra a sandbox (especialmente onde vêm
 * `plan_id`/assinatura e o split em cobranças de assinatura). Ajustar os
 * caminhos + o fixture `rawChargePaidWebhook` quando tivermos um payload real.
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
 * Converte o payload do webhook (JSON já parseado) em `ChargePaidEvent`.
 * Retorna `null` se não for um `charge.paid` válido (o handler ignora/200).
 */
export function parseChargePaidWebhook(payload: Record<string, unknown>): ChargePaidEvent | null {
  const eventId = asString(payload.id);
  if (!eventId || payload.type !== "charge.paid") return null;

  const charge = asRecord(payload.data);
  const chargeId = asString(charge.id);
  const amount = typeof charge.amount === "number" ? charge.amount : 0;
  if (!chargeId || amount <= 0) return null;

  const customer = asRecord(charge.customer);
  const invoice = asRecord(charge.invoice);

  return {
    eventId,
    chargeId,
    amountCents: amount,
    planId: asString(charge.plan_id), // ausente no charge.paid hoje (reservado)
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
