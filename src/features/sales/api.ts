import { supabase } from "@/lib/supabase";

/**
 * Camada de dados do dashboard de vendas.
 *
 * Lê SEMPRE as RPCs de análise (`security invoker`, RLS do usuário aplicada) e o
 * ledger normalizado — nunca `sales_events`, que guarda o payload cru com PII e é
 * restrito a super admin.
 *
 * Dois escopos, porque o domínio tem dois (ver comentário na migration):
 *  · venda   -> por CONTA pagar.me (quem vendeu)
 *  · dinheiro -> por EMPRESA (quem recebe o split)
 */

export interface PagarmeAccountOption {
  id: string;
  slug: string;
  label: string;
  ambiente: string;
}

export async function fetchPagarmeAccounts(): Promise<PagarmeAccountOption[]> {
  const { data, error } = await supabase
    .from("pagarme_accounts")
    .select("id, slug, label, ambiente, active")
    .eq("active", true)
    .order("label");
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    slug: a.slug,
    label: a.label,
    ambiente: a.ambiente,
  }));
}

export interface SalesOverview {
  gmv: number;
  salesCount: number;
  avgTicket: number;
  refunded: number;
  netSales: number;
  /** null quando não houve nenhuma tentativa na janela (sem denominador). */
  approvalRate: number | null;
  attemptsCount: number;
  failedCount: number;
  installmentsAvg: number | null;
  customersCount: number;
}

export async function fetchSalesOverview(
  from: string,
  to: string,
  accountId: string | null,
): Promise<SalesOverview> {
  const { data, error } = await supabase
    .rpc("sales_overview", { p_from: from, p_to: to, p_account_id: accountId ?? undefined })
    .single();
  if (error) throw error;
  return {
    gmv: data.gmv ?? 0,
    salesCount: data.sales_count ?? 0,
    avgTicket: data.avg_ticket ?? 0,
    refunded: data.refunded ?? 0,
    netSales: data.net_sales ?? 0,
    approvalRate: data.approval_rate ?? null,
    attemptsCount: data.attempts_count ?? 0,
    failedCount: data.failed_count ?? 0,
    installmentsAvg: data.installments_avg ?? null,
    customersCount: data.customers_count ?? 0,
  };
}

export type SalesGrain = "day" | "week" | "month";

export interface SalesTimeseriesPoint {
  bucket: string;
  gmv: number;
  salesCount: number;
  avgTicket: number;
  failedCount: number;
}

export async function fetchSalesTimeseries(
  from: string,
  to: string,
  grain: SalesGrain,
  accountId: string | null,
): Promise<SalesTimeseriesPoint[]> {
  const { data, error } = await supabase.rpc("sales_timeseries", {
    p_from: from,
    p_to: to,
    p_grain: grain,
    p_account_id: accountId ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    bucket: r.bucket,
    gmv: r.gmv ?? 0,
    salesCount: r.sales_count ?? 0,
    avgTicket: r.avg_ticket ?? 0,
    failedCount: r.failed_count ?? 0,
  }));
}

export type SalesDimension = "payment_method" | "installments" | "plan" | "brand" | "company";

export interface SalesBreakdownRow {
  label: string;
  amount: number;
  salesCount: number;
}

export async function fetchSalesBreakdown(
  from: string,
  to: string,
  dimension: SalesDimension,
  accountId: string | null,
): Promise<SalesBreakdownRow[]> {
  const { data, error } = await supabase.rpc("sales_breakdown", {
    p_from: from,
    p_to: to,
    p_dimension: dimension,
    p_account_id: accountId ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    label: r.label,
    amount: r.amount ?? 0,
    salesCount: r.sales_count ?? 0,
  }));
}

export interface SalesCustomers {
  newCustomers: number;
  returningCustomers: number;
  newRevenue: number;
  returningRevenue: number;
  repeatRate: number | null;
  /** 1ª compra registrada no ledger — se for recente, "novo" pode ser artefato do backfill. */
  ledgerSince: string | null;
}

export async function fetchSalesCustomers(
  from: string,
  to: string,
  accountId: string | null,
): Promise<SalesCustomers> {
  const { data, error } = await supabase
    .rpc("sales_customers", { p_from: from, p_to: to, p_account_id: accountId ?? undefined })
    .single();
  if (error) throw error;
  return {
    newCustomers: data.new_customers ?? 0,
    returningCustomers: data.returning_customers ?? 0,
    newRevenue: data.new_revenue ?? 0,
    returningRevenue: data.returning_revenue ?? 0,
    repeatRate: data.repeat_rate ?? null,
    ledgerSince: data.ledger_since ?? null,
  };
}

export interface SalesRecurrence {
  /** false = escopo sem objeto assinatura (o caso da RCO): só o bloco de backlog vale. */
  hasSubscriptions: boolean;
  mrrActive: number;
  subsActive: number;
  subsNew: number;
  subsCanceled: number;
  churnRateLogo: number | null;
  involuntaryFailed: number;
  contractedReceivables: number;
  contractedInstallments: number;
}

export async function fetchSalesRecurrence(
  from: string,
  to: string,
  accountId: string | null,
): Promise<SalesRecurrence> {
  const { data, error } = await supabase
    .rpc("sales_recurrence", { p_from: from, p_to: to, p_account_id: accountId ?? undefined })
    .single();
  if (error) throw error;
  return {
    hasSubscriptions: data.has_subscriptions,
    mrrActive: data.mrr_active ?? 0,
    subsActive: data.subs_active ?? 0,
    subsNew: data.subs_new ?? 0,
    subsCanceled: data.subs_canceled ?? 0,
    churnRateLogo: data.churn_rate_logo ?? null,
    involuntaryFailed: data.involuntary_failed ?? 0,
    contractedReceivables: data.contracted_receivables ?? 0,
    contractedInstallments: data.contracted_installments ?? 0,
  };
}

export interface ReceivablesMonth {
  monthStart: string;
  gross: number;
  fees: number;
  net: number;
  installmentsCount: number;
  settledGross: number;
  pendingGross: number;
  /** Só as parcelas ainda não liquidadas — não confundir com installmentsCount. */
  pendingInstallments: number;
}

export async function fetchReceivablesSchedule(
  from: string,
  to: string,
  companyId: string | null,
): Promise<ReceivablesMonth[]> {
  const { data, error } = await supabase.rpc("receivables_schedule", {
    p_from: from,
    p_to: to,
    p_company_id: companyId ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    monthStart: r.month_start,
    gross: r.gross ?? 0,
    fees: r.fees ?? 0,
    net: r.net ?? 0,
    installmentsCount: r.installments_count ?? 0,
    settledGross: r.settled_gross ?? 0,
    pendingGross: r.pending_gross ?? 0,
    pendingInstallments: r.pending_installments ?? 0,
  }));
}

export interface LedgerHealthIssue {
  companyId: string;
  issue: string;
  occurrences: number;
  amount: number;
  detail: string;
}

/** Furos acionáveis do ledger. Lista vazia = saudável. */
export async function fetchLedgerHealth(): Promise<LedgerHealthIssue[]> {
  const { data, error } = await supabase
    .from("v_pagarme_ledger_health")
    .select("company_id, issue, occurrences, amount, detail");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    companyId: r.company_id ?? "",
    issue: r.issue ?? "unknown",
    occurrences: r.occurrences ?? 0,
    amount: r.amount ?? 0,
    detail: r.detail ?? "",
  }));
}
