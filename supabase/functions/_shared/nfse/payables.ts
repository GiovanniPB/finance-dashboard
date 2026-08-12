/**
 * Split AUTORITATIVO de uma venda via `GET /payables?charge_id=` do pagar.me.
 *
 * Por quê: o split[] do webhook nem sempre reflete a fatia líquida real; os
 * "payables" (recebíveis) são a fonte de verdade — crédito (+) menos
 * estorno/chargeback (−) por recebedor. (Atenção: o `/payables` GLOBAL é
 * quebrado para paginação; o filtro `?charge_id=` funciona — por isso só usamos
 * este.)
 *
 * Esta é a visão **fiscal** do payload: só o bruto por recebedor, que é o que
 * decide de quem é a nota. O parsing completo (parcela, data de liquidação,
 * taxa, status) vive em `_shared/pagarme/payables.ts` — a camada base do
 * provedor — e alimenta o ledger de vendas/recebíveis.
 *
 * Separação puro/IO:
 *  - `parsePayables` é PURO (agrega a resposta) — testado por Vitest;
 *  - `fetchChargeSplit` faz o HTTP (usado pelo webhook, Deno).
 */

import { aggregateGrossByRecipient, parsePayablesDetailed } from "../pagarme/payables.ts";
import type { PagarmeSplit } from "./types.ts";

const PAGARME_BASE = "https://api.pagar.me/core/v5";

export interface PayablesSplitResult {
  /** Fatias líquidas (centavos, > 0) por recebedor — sempre `flat`. */
  split: PagarmeSplit[];
  /** Soma das fatias (centavos) — para validar contra o valor pago. */
  totalCents: number;
}

/**
 * Agrega os payables por recebedor: crédito soma, estorno/chargeback subtrai.
 * Devolve apenas fatias líquidas positivas (recebedor totalmente estornado some).
 */
export function parsePayables(response: unknown): PayablesSplitResult {
  const byRecipient = aggregateGrossByRecipient(parsePayablesDetailed(response));

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
