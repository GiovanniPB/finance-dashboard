/**
 * Escrita no ledger de vendas — a camada que toca o banco.
 *
 * Compartilhada entre `pagarme-webhook` (tempo real) e `pagarme-sync`
 * (cron/backfill), para que os dois caminhos gravem exatamente a mesma coisa.
 * A lógica de mapeamento é pura (`ledger.ts`); aqui é só upsert + orquestração.
 *
 * Todas as escritas são **idempotentes** por chave natural, então webhook,
 * sweep e backfill podem tocar a mesma linha em qualquer ordem.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchChargePayables } from "./api.ts";
import type { PagarmeChargeRecord, PagarmeCustomerRecord } from "./charges.ts";
import {
  buildCompanyResolver,
  chargeRow,
  customerRow,
  receivableRows,
  refundedAmountFromPayables,
  subscriptionRow,
  type LedgerAccount,
} from "./ledger.ts";
import type { PagarmePayable } from "./payables.ts";
import type { PagarmeSubscriptionRecord } from "./subscriptions.ts";

/** Conta pagar.me + mapa recebedor→empresa, tudo que a escrita precisa. */
export interface LedgerContext {
  account: LedgerAccount;
  recipientToCompany: Map<string, string>;
}

/** Carrega a conta (por slug OU id) e o mapa de recebedores ativos. */
export async function loadLedgerContext(
  supabase: SupabaseClient,
  by: { slug?: string; accountId?: string },
): Promise<LedgerContext | null> {
  let query = supabase
    .from("pagarme_accounts")
    .select("id, organization_id, owner_company_id")
    .eq("active", true);

  if (by.accountId) query = query.eq("id", by.accountId);
  else if (by.slug) query = query.eq("slug", by.slug);
  else return null;

  const { data } = await query.maybeSingle();
  if (!data) return null;

  const account: LedgerAccount = {
    id: data.id as string,
    organizationId: data.organization_id as string,
    ownerCompanyId: data.owner_company_id as string,
  };

  const { data: recipients } = await supabase
    .from("pagarme_recipient_map")
    .select("pagarme_recipient_id, company_id")
    .eq("pagarme_account_id", account.id)
    .eq("active", true);

  const recipientToCompany = new Map<string, string>();
  for (const r of recipients ?? []) {
    recipientToCompany.set(r.pagarme_recipient_id as string, r.company_id as string);
  }

  return { account, recipientToCompany };
}

/** Upsert de um comprador (de `customer.*` ou embutido numa cobrança). */
export async function writeCustomerRecord(
  supabase: SupabaseClient,
  ctx: LedgerContext,
  customer: PagarmeCustomerRecord,
  firstPurchaseAt: string | null = null,
): Promise<void> {
  const row = customerRow(customer, ctx.account, firstPurchaseAt);
  if (!row) return;

  await supabase.from("pagarme_customers").upsert(row, {
    onConflict: "pagarme_account_id,pagarme_customer_id",
  });
}

/** Upsert do comprador embutido na cobrança. Silencioso quando não há cliente. */
export async function writeCustomer(
  supabase: SupabaseClient,
  ctx: LedgerContext,
  charge: PagarmeChargeRecord,
): Promise<void> {
  if (!charge.customer) return;
  await writeCustomerRecord(supabase, ctx, charge.customer, charge.paidAt);
}

/** Upsert da venda. */
export async function writeCharge(
  supabase: SupabaseClient,
  ctx: LedgerContext,
  charge: PagarmeChargeRecord,
  salesEventId: string | null = null,
): Promise<void> {
  await supabase.from("pagarme_charges").upsert(chargeRow(charge, ctx.account, salesEventId), {
    onConflict: "pagarme_account_id,pagarme_charge_id",
  });
}

/** Upsert da assinatura. */
export async function writeSubscription(
  supabase: SupabaseClient,
  ctx: LedgerContext,
  sub: PagarmeSubscriptionRecord,
): Promise<void> {
  await supabase.from("pagarme_subscriptions").upsert(subscriptionRow(sub, ctx.account), {
    onConflict: "pagarme_account_id,pagarme_subscription_id",
  });
}

export interface ReceivablesWriteResult {
  written: number;
  /** Recebedores sem empresa mapeada — dinheiro que ficou FORA do ledger. */
  unmappedRecipients: string[];
}

/**
 * Grava/atualiza recebíveis. Usado tanto com os payables de uma cobrança quanto
 * com os que vêm das operações de saldo.
 */
export async function writeReceivables(
  supabase: SupabaseClient,
  ctx: LedgerContext,
  payables: readonly PagarmePayable[],
): Promise<ReceivablesWriteResult> {
  const resolve = buildCompanyResolver(ctx.account, ctx.recipientToCompany);
  const { rows, unmappedRecipients } = receivableRows(payables, ctx.account, resolve);
  if (rows.length === 0) return { written: 0, unmappedRecipients };

  const { error } = await supabase.from("pagarme_receivables").upsert(rows, {
    onConflict: "pagarme_account_id,pagarme_payable_id",
  });
  if (error) throw new Error(`receivables_upsert_failed: ${error.message}`);

  return { written: rows.length, unmappedRecipients };
}

export interface ChargePayablesSyncResult {
  status: "synced" | "no_api_key" | "fetch_failed" | "no_payables";
  written: number;
  unmappedRecipients: string[];
}

/**
 * Materializa o cronograma de uma cobrança: busca `/payables?charge_id=`, grava
 * os recebíveis e atualiza o valor estornado da venda.
 *
 * `apiKey` opcional: o backfill já tem a chave em mãos e evita um RPC por
 * cobrança; o webhook deixa buscar aqui.
 */
export async function syncChargePayables(
  supabase: SupabaseClient,
  ctx: LedgerContext,
  chargeId: string,
  apiKey?: string,
): Promise<ChargePayablesSyncResult> {
  let key = apiKey;
  if (!key) {
    const { data } = await supabase.rpc("get_pagarme_account_secret", {
      p_account_id: ctx.account.id,
    });
    key = typeof data === "string" && data.length > 0 ? data : undefined;
  }
  if (!key) return { status: "no_api_key", written: 0, unmappedRecipients: [] };

  const payables = await fetchChargePayables(chargeId, key);
  if (payables === null) return { status: "fetch_failed", written: 0, unmappedRecipients: [] };
  if (payables.length === 0) return { status: "no_payables", written: 0, unmappedRecipients: [] };

  const { written, unmappedRecipients } = await writeReceivables(supabase, ctx, payables);

  // valor estornado só é confiável pela agregação dos payables (o objeto charge
  // não expõe) — atualiza só quando há estorno, para não escrever em vão
  const refunded = refundedAmountFromPayables(payables);
  if (refunded !== "0.00") {
    await supabase
      .from("pagarme_charges")
      .update({ refunded_amount: refunded })
      .eq("pagarme_account_id", ctx.account.id)
      .eq("pagarme_charge_id", chargeId);
  }

  return { status: "synced", written, unmappedRecipients };
}
