/**
 * Roteamento dos webhooks do pagar.me.
 *
 * Até aqui o `pagarme-webhook` entendia **um** tipo (`charge.paid`) e o tratava
 * como fato fiscal. Com o ledger de vendas ele passa a ingerir vários tipos — o
 * que exige separar explicitamente "o que gravar" de "o que emite nota".
 *
 * INVARIANTE CRÍTICA: `explodeFiscal` é verdadeiro **somente** para
 * `charge.paid`. Nenhum evento novo pode disparar emissão de nota fiscal. Há
 * teste dedicado a isso — a esteira de NFS-e está em produção e não pode
 * regredir por causa desta feature.
 *
 * Todo evento continua sendo gravado bruto em `sales_events` pela função (é a
 * dedup e a trilha); esta classificação decide apenas o que fazer DEPOIS.
 */

/** O que fazer com um evento, além de gravá-lo bruto. */
export interface EventAction {
  /** `data` é uma cobrança -> upsert em `pagarme_charges`. */
  upsertCharge: boolean;
  /** Upsert do comprador embutido (ou de `data`, em `customer.*`). */
  upsertCustomer: boolean;
  /** `data` é uma assinatura -> upsert em `pagarme_subscriptions`. */
  upsertSubscription: boolean;
  /** Buscar `/payables?charge_id=` e materializar/atualizar o cronograma. */
  syncPayables: boolean;
  /** Explodir em `invoice_jobs` (emissão de nota). SÓ `charge.paid`. */
  explodeFiscal: boolean;
}

const NOTHING: EventAction = {
  upsertCharge: false,
  upsertCustomer: false,
  upsertSubscription: false,
  syncPayables: false,
  explodeFiscal: false,
};

/** Cobrança paga: o único evento que gera nota. Materializa o cronograma. */
const CHARGE_PAID: EventAction = {
  upsertCharge: true,
  upsertCustomer: true,
  upsertSubscription: false,
  syncPayables: true,
  explodeFiscal: true,
};

/** Cobrança que ainda não é dinheiro (funil / taxa de aprovação). */
const CHARGE_ONLY: EventAction = {
  upsertCharge: true,
  upsertCustomer: true,
  upsertSubscription: false,
  syncPayables: false,
  explodeFiscal: false,
};

/**
 * Cobrança cujo dinheiro MUDOU depois de pago (estorno, chargeback,
 * cancelamento parcial, pago a menos/mais): re-sincroniza os payables, de onde
 * saem os recebíveis negativos.
 */
const CHARGE_WITH_PAYABLES: EventAction = {
  upsertCharge: true,
  upsertCustomer: true,
  upsertSubscription: false,
  syncPayables: true,
  explodeFiscal: false,
};

const SUBSCRIPTION_ONLY: EventAction = {
  upsertCharge: false,
  upsertCustomer: false,
  upsertSubscription: true,
  syncPayables: false,
  explodeFiscal: false,
};

const CUSTOMER_ONLY: EventAction = {
  upsertCharge: false,
  upsertCustomer: true,
  upsertSubscription: false,
  syncPayables: false,
  explodeFiscal: false,
};

const EVENT_ACTIONS: Record<string, EventAction> = {
  // --- cobrança ---
  "charge.paid": CHARGE_PAID,
  "charge.created": CHARGE_ONLY,
  "charge.pending": CHARGE_ONLY,
  "charge.processing": CHARGE_ONLY,
  "charge.payment_failed": CHARGE_ONLY,
  "charge.updated": CHARGE_ONLY,
  "charge.refunded": CHARGE_WITH_PAYABLES,
  "charge.chargedback": CHARGE_WITH_PAYABLES,
  "charge.partial_canceled": CHARGE_WITH_PAYABLES,
  "charge.underpaid": CHARGE_WITH_PAYABLES,
  "charge.overpaid": CHARGE_WITH_PAYABLES,

  // --- assinatura ---
  "subscription.created": SUBSCRIPTION_ONLY,
  "subscription.canceled": SUBSCRIPTION_ONLY,

  // --- comprador ---
  "customer.created": CUSTOMER_ONLY,
  "customer.updated": CUSTOMER_ONLY,

  // --- faturas de ciclo ---
  // `invoice.*` não traz a assinatura completa (só `subscriptionId`), então não
  // há o que gravar a partir dele: o churn involuntário é lido da COBRANÇA
  // recusada (que carrega o subscriptionId) e o status da assinatura vem do sync
  // diário. O evento segue registrado em `sales_events`.
  "invoice.created": NOTHING,
  "invoice.updated": NOTHING,
  "invoice.paid": NOTHING,
  "invoice.payment_failed": NOTHING,
  "invoice.canceled": NOTHING,
};

/**
 * O que fazer com o evento. Tipo desconhecido devolve `NOTHING` — nunca lança e
 * nunca "adivinha": um evento novo do provedor fica registrado em `sales_events`
 * sem efeito colateral, e a gente decide depois.
 */
export function classifyEvent(eventType: string): EventAction {
  return EVENT_ACTIONS[eventType] ?? NOTHING;
}

/** Tipos que o roteador reconhece (para diagnóstico/UI). */
export function knownEventTypes(): string[] {
  return Object.keys(EVENT_ACTIONS);
}

/**
 * Emite nota? Espelha a invariante, exposto separado para o teste e para deixar
 * a regra legível no ponto de uso.
 */
export function emitsFiscalDocument(eventType: string): boolean {
  return classifyEvent(eventType).explodeFiscal;
}
