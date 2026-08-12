/**
 * Cliente HTTP da API v5 do pagar.me — a única camada com I/O de rede.
 *
 * Os parsers (`charges.ts`, `payables.ts`, `subscriptions.ts`) são puros e
 * testados por Vitest; aqui só buscamos e delegamos. Erro de rede/API devolve
 * `null` (o chamador reagenda), nunca lança.
 *
 * Limites e armadilhas confirmados na Fase 0 (`pagarme-api-contract.md`):
 *  - `/charges`: 200 req/min, página **capada em 30**, `paging` com total/next;
 *  - `/payables`: 700 req/min, mas o GLOBAL tem paginação quebrada
 *    (`paging: {}`) — só `?charge_id=` é utilizável;
 *  - `/balance/operations`: 300 req/min, pagina de verdade;
 *  - `/subscriptions`: 200 req/min;
 *  - `/transfers`: **401 por allowlist de IP** — inutilizável do Supabase, por
 *    isso não há função para ele aqui (saque vem da conciliação do extrato).
 */

import { CHARGES_PAGE_SIZE, parseChargesListPage, type ChargesListPage } from "./charges.ts";
import {
  parseBalanceOperationPayables,
  parsePayablesDetailed,
  type PagarmePayable,
} from "./payables.ts";
import { parseSubscriptionsListPage, type SubscriptionsListPage } from "./subscriptions.ts";

export const PAGARME_BASE = "https://api.pagar.me/core/v5";

/** Basic Auth do pagar.me: usuário = secret key, senha vazia. */
function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: "Basic " + btoa(`${apiKey}:`),
    Accept: "application/json",
  };
}

async function getJson(url: string, apiKey: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: authHeaders(apiKey) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Recebíveis de UMA cobrança — o cronograma completo (parcela, data de
 * liquidação, taxa, status). `size=100` cobre 12 parcelas × vários recebedores.
 */
export async function fetchChargePayables(
  chargeId: string,
  apiKey: string,
  baseUrl: string = PAGARME_BASE,
): Promise<PagarmePayable[] | null> {
  const url = `${baseUrl}/payables?charge_id=${encodeURIComponent(chargeId)}&size=100`;
  const body = await getJson(url, apiKey);
  return body === null ? null : parsePayablesDetailed(body);
}

export interface ChargesPageParams {
  apiKey: string;
  page: number;
  /** Filtros de janela (best-effort no servidor; o worker também filtra). */
  createdSince?: string | null;
  createdUntil?: string | null;
  /** Sem filtro = todos os status (necessário para taxa de aprovação). */
  status?: string | null;
}

/** Uma página de cobranças. Sempre `size=30` — a API capa aí. */
export async function fetchChargesPage(
  params: ChargesPageParams,
  baseUrl: string = PAGARME_BASE,
): Promise<ChargesListPage | null> {
  const query = new URLSearchParams({
    page: String(params.page),
    size: String(CHARGES_PAGE_SIZE),
  });
  if (params.status) query.set("status", params.status);
  if (params.createdSince) query.set("created_since", params.createdSince);
  if (params.createdUntil) query.set("created_until", params.createdUntil);

  const body = await getJson(`${baseUrl}/charges?${query.toString()}`, params.apiKey);
  return body === null ? null : parseChargesListPage(body);
}

/** Uma página de assinaturas. Página vazia é caso normal (conta sem assinatura). */
export async function fetchSubscriptionsPage(
  apiKey: string,
  page: number,
  size = 50,
  baseUrl: string = PAGARME_BASE,
): Promise<SubscriptionsListPage | null> {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  const body = await getJson(`${baseUrl}/subscriptions?${query.toString()}`, apiKey);
  return body === null ? null : parseSubscriptionsListPage(body);
}

export interface BalanceOperationsPage {
  payables: PagarmePayable[];
  /** Itens brutos (0 ⇒ fim da paginação). */
  count: number;
}

/**
 * Operações de saldo — a via PRIMÁRIA de realização das liquidações. Devolve o
 * payable liquidado dentro de `movement_object`, com `split_id` (que `/payables`
 * não traz). Operações que não são de payable são descartadas pelo parser, então
 * `count` (bruto) é o sinal de fim de paginação, não `payables.length`.
 */
export async function fetchBalanceOperationsPage(
  apiKey: string,
  page: number,
  size = 100,
  baseUrl: string = PAGARME_BASE,
): Promise<BalanceOperationsPage | null> {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  const body = await getJson(`${baseUrl}/balance/operations?${query.toString()}`, apiKey);
  if (body === null) return null;

  const raw = body as { data?: unknown };
  const count = Array.isArray(raw.data) ? raw.data.length : 0;
  return { payables: parseBalanceOperationPayables(body), count };
}

export interface RecipientBalance {
  availableCents: number;
  waitingFundsCents: number;
  transferredCents: number;
}

/**
 * Saldo de um recebedor. `waiting_funds_amount` é o **contra-cheque da
 * conciliação**: a soma dos nossos recebíveis `waiting_funds` desse recebedor
 * tem que bater com ele.
 */
export async function fetchRecipientBalance(
  recipientId: string,
  apiKey: string,
  baseUrl: string = PAGARME_BASE,
): Promise<RecipientBalance | null> {
  const body = await getJson(
    `${baseUrl}/recipients/${encodeURIComponent(recipientId)}/balance`,
    apiKey,
  );
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    availableCents: num(b.available_amount),
    waitingFundsCents: num(b.waiting_funds_amount),
    transferredCents: num(b.transferred_amount),
  };
}
