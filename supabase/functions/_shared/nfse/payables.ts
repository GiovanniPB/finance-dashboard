/**
 * Split AUTORITATIVO de uma venda via `GET /payables?charge_id=` do pagar.me.
 *
 * Por quê: o split[] do webhook nem sempre reflete a fatia líquida real; os
 * "payables" (recebíveis) são a fonte de verdade — crédito (+) menos
 * estorno/chargeback (−) por recebedor. (Atenção: o `/payables` GLOBAL é
 * quebrado para paginação; o filtro `?charge_id=` funciona — por isso só usamos
 * este.)
 *
 * Separação puro/IO:
 *  - `parsePayables` é PURO (agrega a resposta) — testado por Vitest;
 *  - `fetchChargeSplit` faz o HTTP (usado pelo webhook, Deno).
 */

import type { PagarmeSplit } from "./types.ts";

const PAGARME_BASE = "https://api.pagar.me/core/v5";

export interface PayablesSplitResult {
  /** Fatias líquidas (centavos, > 0) por recebedor — sempre `flat`. */
  split: PagarmeSplit[];
  /** Soma das fatias (centavos) — para validar contra o valor pago. */
  totalCents: number;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: unknown[] }).data;
  }
  return [];
}

function recipientOf(p: Record<string, unknown>): string | null {
  if (typeof p.recipient_id === "string" && p.recipient_id) return p.recipient_id;
  const rec = p.recipient;
  if (rec && typeof rec === "object" && typeof (rec as { id?: unknown }).id === "string") {
    return (rec as { id: string }).id;
  }
  return null;
}

/**
 * Agrega os payables por recebedor: crédito soma, estorno/chargeback subtrai.
 * Devolve apenas fatias líquidas positivas (recebedor totalmente estornado some).
 */
export function parsePayables(response: unknown): PayablesSplitResult {
  const byRecipient = new Map<string, number>();

  for (const item of asArray(response)) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const recipientId = recipientOf(p);
    if (!recipientId) continue;
    const amount = typeof p.amount === "number" ? p.amount : 0;
    const cur = byRecipient.get(recipientId) ?? 0;

    if (p.type === "credit") {
      byRecipient.set(recipientId, cur + amount);
    } else if (p.type === "chargeback" || p.type === "refund") {
      byRecipient.set(recipientId, cur - Math.abs(amount));
    }
  }

  const split: PagarmeSplit[] = [];
  for (const [recipientId, amount] of byRecipient) {
    if (amount > 0) split.push({ recipientId, amount, type: "flat" });
  }
  const totalCents = split.reduce((acc, s) => acc + s.amount, 0);
  return { split, totalCents };
}

/** Consulta os payables da venda no pagar.me (HTTP). null em erro de rede/API. */
export async function fetchChargeSplit(
  chargeId: string,
  apiKey: string,
  baseUrl: string = PAGARME_BASE,
): Promise<PayablesSplitResult | null> {
  try {
    const url = `${baseUrl}/payables?charge_id=${encodeURIComponent(chargeId)}&size=100`;
    const res = await fetch(url, {
      headers: { Authorization: "Basic " + btoa(`${apiKey}:`), Accept: "application/json" },
    });
    if (!res.ok) return null;
    return parsePayables(await res.json());
  } catch {
    return null;
  }
}
