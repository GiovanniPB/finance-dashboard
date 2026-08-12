/**
 * Mapeamento dos registros normalizados do pagar.me -> linhas do ledger de vendas.
 *
 * Puro e sem I/O: recebe registros já parseados + o contexto da conta e devolve
 * objetos prontos para `upsert`. Quem faz o HTTP e o banco é a Edge Function.
 *
 * Dinheiro sempre via `centsToReais` (string decimal), nunca float — ver `money.ts`.
 */

import type { PagarmeChargeRecord, PagarmeCustomerRecord } from "./charges.ts";
import { centsToReais, centsToReaisOrNull } from "./money.ts";
import type { PagarmePayable } from "./payables.ts";
import type { PagarmeSubscriptionRecord } from "./subscriptions.ts";

/** Contexto da conta pagar.me para carimbar as linhas. */
export interface LedgerAccount {
  id: string;
  organizationId: string;
  ownerCompanyId: string;
}

/**
 * Resolve a empresa de um recebedor do split.
 *
 * `null` como `recipientId` = cobrança sem split -> empresa dona da conta.
 * Recebedor NÃO mapeado devolve `null` e o recebível é **descartado com
 * relatório** — nunca atribuído ao dono como chute, porque isso creditaria
 * receita na empresa errada e corromperia o "a receber".
 */
export type ResolveCompany = (recipientId: string | null) => string | null;

export function buildCompanyResolver(
  account: LedgerAccount,
  recipientToCompany: ReadonlyMap<string, string>,
): ResolveCompany {
  return (recipientId) => {
    if (!recipientId) return account.ownerCompanyId;
    return recipientToCompany.get(recipientId) ?? null;
  };
}

// ---------------------------------------------------------------------------
// pagarme_customers
// ---------------------------------------------------------------------------

export function customerRow(
  customer: PagarmeCustomerRecord,
  account: LedgerAccount,
  firstPurchaseAt: string | null = null,
): Record<string, unknown> | null {
  if (!customer.customerId) return null;
  return {
    organization_id: account.organizationId,
    pagarme_account_id: account.id,
    pagarme_customer_id: customer.customerId,
    name: customer.name,
    email: customer.email,
    document: customer.document,
    document_type: customer.documentType,
    first_purchase_at: firstPurchaseAt,
    last_synced_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// pagarme_charges
// ---------------------------------------------------------------------------

export function chargeRow(
  charge: PagarmeChargeRecord,
  account: LedgerAccount,
  salesEventId: string | null = null,
): Record<string, unknown> {
  return {
    organization_id: account.organizationId,
    pagarme_account_id: account.id,
    pagarme_charge_id: charge.chargeId,
    pagarme_order_id: charge.orderId,
    pagarme_invoice_id: charge.invoiceId,
    pagarme_subscription_id: charge.subscriptionId,
    pagarme_plan_id: charge.planId,
    pagarme_customer_id: charge.customerId,
    status: charge.status,
    payment_method: charge.paymentMethod,
    installments: charge.installments,
    amount: centsToReais(charge.amountCents),
    paid_amount: centsToReaisOrNull(charge.paidAmountCents),
    currency: charge.currency,
    charge_created_at: charge.chargeCreatedAt,
    paid_at: charge.paidAt,
    card_brand: charge.cardBrand,
    card_last_four: charge.cardLastFour,
    acquirer_name: charge.acquirerName,
    recurrence_cycle: charge.recurrenceCycle,
    // só carimba a procedência quando veio de webhook (backfill não tem evento)
    ...(salesEventId ? { sales_event_id: salesEventId } : {}),
    last_synced_at: new Date().toISOString(),
    // `refunded_amount` NÃO é escrito aqui: vem da agregação dos payables de
    // estorno/chargeback (ver `refundedAmountFromPayables`), que é a fonte
    // confiável — o objeto charge não expõe o valor estornado.
  };
}

// ---------------------------------------------------------------------------
// pagarme_subscriptions
// ---------------------------------------------------------------------------

export function subscriptionRow(
  sub: PagarmeSubscriptionRecord,
  account: LedgerAccount,
): Record<string, unknown> {
  return {
    organization_id: account.organizationId,
    pagarme_account_id: account.id,
    pagarme_subscription_id: sub.subscriptionId,
    pagarme_customer_id: sub.customerId,
    pagarme_plan_id: sub.planId,
    plan_name: sub.planName,
    status: sub.status,
    interval: sub.interval,
    interval_count: sub.intervalCount,
    billing_type: sub.billingType,
    payment_method: sub.paymentMethod,
    start_at: sub.startAt,
    next_billing_at: sub.nextBillingAt,
    canceled_at: sub.canceledAt,
    current_cycle_start: sub.currentCycleStart,
    current_cycle_end: sub.currentCycleEnd,
    mrr: sub.mrr,
    last_synced_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// pagarme_receivables
// ---------------------------------------------------------------------------

export interface ReceivableMapping {
  rows: Record<string, unknown>[];
  /** Recebedores sem empresa mapeada — dinheiro que NÃO entrou no ledger. */
  unmappedRecipients: string[];
}

/**
 * Payables -> linhas de `pagarme_receivables`.
 *
 * `settled_on` e `net_amount` NÃO são enviados: são colunas geradas no banco.
 * `first_seen_payment_date` também não: o trigger o congela na primeira escrita.
 */
export function receivableRows(
  payables: readonly PagarmePayable[],
  account: LedgerAccount,
  resolveCompany: ResolveCompany,
): ReceivableMapping {
  const rows: Record<string, unknown>[] = [];
  const unmapped = new Set<string>();
  const now = new Date().toISOString();

  for (const p of payables) {
    if (!p.id) continue; // sem id não há chave de idempotência
    const companyId = resolveCompany(p.recipientId);
    if (!companyId) {
      if (p.recipientId) unmapped.add(p.recipientId);
      continue;
    }

    rows.push({
      organization_id: account.organizationId,
      pagarme_account_id: account.id,
      pagarme_payable_id: p.id,
      pagarme_charge_id: p.chargeId,
      pagarme_recipient_id: p.recipientId,
      company_id: companyId,
      type: p.type ?? "unknown",
      status: p.status ?? "unknown",
      installment: p.installment,
      amount: centsToReais(p.amountCents),
      fee: centsToReais(p.feeCents),
      anticipation_fee: centsToReais(p.anticipationFeeCents),
      fraud_coverage_fee: centsToReais(p.fraudCoverageFeeCents),
      expected_payment_date: p.settlementDate,
      sale_accrual_at: p.accrualAt,
      liquidation_arrangement_id: p.liquidationArrangementId,
      split_id: p.splitId,
      gateway_id: p.gatewayId,
      payment_method: p.paymentMethod,
      last_synced_at: now,
    });
  }

  return { rows, unmappedRecipients: [...unmapped] };
}

/**
 * Valor estornado de uma venda, em reais, a partir dos payables: soma dos
 * `refund`/`chargeback` (que o parser marca com sinal negativo).
 */
export function refundedAmountFromPayables(payables: readonly PagarmePayable[]): string {
  const cents = payables.reduce(
    (acc, p) => acc + (p.signedAmountCents < 0 ? Math.abs(p.signedAmountCents) : 0),
    0,
  );
  return centsToReais(cents);
}
