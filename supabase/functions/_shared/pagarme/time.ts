/**
 * Normalização de datas do pagar.me.
 *
 * Mora em `_shared/pagarme/` porque é a camada BASE da API (domínio bruto do
 * provedor); as camadas de cima (`_shared/nfse/` fiscal, e o ledger de vendas)
 * dependem dela, nunca o contrário.
 *
 * Duas conversões distintas, que é fácil confundir:
 *
 *  - `pagarmeTimestamp` — string do pagar.me -> **instante** ISO UTC.
 *  - `saoPauloDate`     — instante -> **data civil** (YYYY-MM-DD) no fuso de
 *    São Paulo. É a que vale para `date` no Postgres (vencimento, liquidação).
 */

/** Tem sufixo de fuso ("Z" ou ±hh:mm)? */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Data do pagar.me -> instante ISO UTC.
 *
 * O payload de webhook vem **sem** offset (`"2026-07-31T14:32:54"`) e a API
 * documenta UTC; sem carimbar o fuso, `new Date` interpretaria como hora local
 * e deslocaria a data em até um dia nas pontas. Já os campos de `/payables`
 * vêm com `Z` explícito — ambos os formatos são aceitos aqui.
 *
 * Retorna null para ausente/inválida (não inventa data).
 */
export function pagarmeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const iso = HAS_OFFSET.test(value) ? value : `${value}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Formatador de data civil em São Paulo. `formatToParts` em vez do truque do
 * locale `en-CA` para não depender de como o ICU do runtime ordena a data.
 */
const SAO_PAULO_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Instante -> data civil `YYYY-MM-DD` no fuso de São Paulo.
 *
 * **Por que não usar a data UTC direto:** o pagar.me expressa datas de
 * liquidação como meia-noite de Brasília em UTC — `2026-09-14T03:00:00Z` é
 * "14/09" para o negócio. Nesse formato a data UTC coincide, mas a coincidência
 * depende do offset: se o provedor passar a devolver `2026-09-14T00:00:00Z`, a
 * leitura UTC daria 14/09 e a civil daria 13/09. Convertendo explicitamente
 * fixamos a semântica ("o dia em que o dinheiro cai no Brasil") em vez de
 * depender do formato.
 *
 * O horário de verão brasileiro foi extinto em 2019, então o offset é -03:00
 * estável; ainda assim o `Intl` cobre o histórico corretamente.
 */
export function saoPauloDate(value: unknown): string | null {
  const iso = pagarmeTimestamp(value);
  if (!iso) return null;

  const parts = SAO_PAULO_PARTS.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
}
