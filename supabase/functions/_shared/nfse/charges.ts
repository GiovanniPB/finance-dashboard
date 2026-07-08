/**
 * Cliente de leitura de cobranças do pagar.me para o **backfill** (emissão
 * retroativa). Duas chamadas, porque a lista é magra:
 *
 *  - `GET /charges` (enumerar) — devolve ids + status + paging, **sem**
 *    `customer.address` nem `split` (confirmado em 2026-07);
 *  - `GET /charges/{id}` (hidratar) — traz `customer.address` e o
 *    `last_transaction.split[]`. É o objeto que alimenta `parseChargeResource`.
 *
 * O split AUTORITATIVO ainda vem de `/payables` (ver `payables.ts`); aqui só
 * enumeramos e hidratamos.
 *
 * Separação puro/IO (mesmo padrão de `payables.ts`):
 *  - `parseChargesPage` é PURO (extrai ids das pagas + paging) — testado por Vitest;
 *  - `fetchChargesPage`/`fetchChargeDetail` fazem o HTTP (usados pela Edge Function).
 */

const PAGARME_BASE = "https://api.pagar.me/core/v5";

/**
 * Tamanho de página do `GET /charges`. O pagar.me **capa em 30** (pedir 50/100
 * ainda devolve 30) — confirmado em produção. Usamos 30 para que `page`×`size`
 * seja consistente e nenhuma cobrança seja pulada na paginação por offset.
 */
export const CHARGES_PAGE_SIZE = 30;

export interface ChargesPage {
  /** ids das cobranças **pagas** nesta página (para hidratar em seguida). */
  paidIds: string[];
  /** total de itens brutos na página (0 ⇒ fim da paginação). */
  count: number;
  /** `paging.total`, quando o pagar.me o informa (senão null). */
  total: number | null;
}

export interface FetchChargesParams {
  apiKey: string;
  /** janela (ISO 8601) — best-effort no servidor; o worker também filtra por data. */
  createdSince?: string | null;
  createdUntil?: string | null;
  page: number;
  size?: number;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: unknown[] }).data;
  }
  return [];
}

/**
 * Extrai (puro) da resposta de `GET /charges` os ids das cobranças **pagas** e o
 * total. Defensivo: só considera itens com `id` string e `status === 'paid'`.
 */
export function parseChargesPage(response: unknown): ChargesPage {
  const items = asArray(response);
  const paidIds: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id === "string" && c.id.length > 0 && c.status === "paid") {
      paidIds.push(c.id);
    }
  }

  let total: number | null = null;
  if (response && typeof response === "object") {
    const paging = (response as { paging?: unknown }).paging;
    if (paging && typeof paging === "object") {
      const t = (paging as { total?: unknown }).total;
      if (typeof t === "number") total = t;
    }
  }

  return { paidIds, count: items.length, total };
}

function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: "Basic " + btoa(`${apiKey}:`), Accept: "application/json" };
}

/**
 * Enumera uma página de cobranças pagas na janela informada. Retorna `null` em
 * erro de rede/API (o worker trata como falha da página e reagenda).
 */
export async function fetchChargesPage(
  params: FetchChargesParams,
  baseUrl: string = PAGARME_BASE,
): Promise<ChargesPage | null> {
  const query = new URLSearchParams({
    status: "paid",
    page: String(params.page),
    size: String(params.size ?? CHARGES_PAGE_SIZE),
  });
  if (params.createdSince) query.set("created_since", params.createdSince);
  if (params.createdUntil) query.set("created_until", params.createdUntil);

  try {
    const res = await fetch(`${baseUrl}/charges?${query.toString()}`, {
      headers: authHeader(params.apiKey),
    });
    if (!res.ok) return null;
    return parseChargesPage(await res.json());
  } catch {
    return null;
  }
}

/**
 * Hidrata uma cobrança (`GET /charges/{id}`) — traz `customer.address` e o
 * split. Retorna o objeto bruto (para `parseChargeResource`) ou `null` em erro.
 */
export async function fetchChargeDetail(
  chargeId: string,
  apiKey: string,
  baseUrl: string = PAGARME_BASE,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${baseUrl}/charges/${encodeURIComponent(chargeId)}`, {
      headers: authHeader(apiKey),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
