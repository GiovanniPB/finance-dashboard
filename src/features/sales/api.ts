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
  companyIds: string[] | null,
): Promise<ReceivablesMonth[]> {
  const { data, error } = await supabase.rpc("receivables_schedule", {
    p_from: from,
    p_to: to,
    p_company_ids: companyIds ?? undefined,
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

export interface ReceivableDetail {
  receivableId: string;
  chargeId: string | null;
  installment: number | null;
  installmentsTotal: number | null;
  amount: number;
  feeTotal: number;
  netAmount: number;
  status: string;
  expectedPaymentDate: string | null;
  /** Data mudou desde a 1ª sincronização = recebível antecipado. */
  anticipated: boolean;
  salePaidAt: string | null;
  /** Null quando o usuário não tem acesso à base comercial da conta (por design). */
  customerName: string | null;
  paymentMethod: string | null;
  cardBrand: string | null;
}

/**
 * Parcelas que compõem um lançamento agregado da projeção — o lastro do valor
 * que aparece em "A Receber". Sem isto o título seria um número sem rastro.
 */
export async function fetchReceivablesOfTransaction(
  transactionId: string,
): Promise<ReceivableDetail[]> {
  const { data, error } = await supabase.rpc("pagarme_receivables_of_transaction", {
    p_transaction_id: transactionId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    receivableId: r.receivable_id,
    chargeId: r.pagarme_charge_id,
    installment: r.installment,
    installmentsTotal: r.installments_total,
    amount: r.amount ?? 0,
    feeTotal: r.fee_total ?? 0,
    netAmount: r.net_amount ?? 0,
    status: r.status,
    expectedPaymentDate: r.expected_payment_date,
    anticipated: r.anticipated,
    salePaidAt: r.sale_paid_at,
    customerName: r.customer_name,
    paymentMethod: r.payment_method,
    cardBrand: r.card_brand,
  }));
}

export interface PagarmeForecastDay {
  day: string;
  inflowPagarme: number;
  feesPagarme: number;
}

/** Série diária das entradas do pagar.me já projetadas, para destacar no forecast. */
export async function fetchPagarmeForecast(
  companyIds: string[] | null,
  from: string,
  to: string,
): Promise<PagarmeForecastDay[]> {
  const { data, error } = await supabase.rpc("forecast_pagarme_inflow", {
    p_company_ids: companyIds ?? undefined,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    day: r.day,
    inflowPagarme: r.inflow_pagarme ?? 0,
    feesPagarme: r.fees_pagarme ?? 0,
  }));
}

export interface GatewayAccount {
  settingsId: string;
  pagarmeAccountId: string;
  accountLabel: string;
  gatewayBankAccountId: string | null;
  gatewayNickname: string | null;
  payoutBankAccountId: string | null;
  payoutNickname: string | null;
  cutoverDate: string;
  enabled: boolean;
}

export async function fetchGatewayAccounts(companyId: string): Promise<GatewayAccount[]> {
  const { data, error } = await supabase.rpc("pagarme_gateway_accounts", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    settingsId: r.settings_id,
    pagarmeAccountId: r.pagarme_account_id,
    accountLabel: r.account_label,
    gatewayBankAccountId: r.gateway_bank_account_id,
    gatewayNickname: r.gateway_nickname,
    payoutBankAccountId: r.payout_bank_account_id,
    payoutNickname: r.payout_nickname,
    cutoverDate: r.cutover_date,
    enabled: r.enabled,
  }));
}

export interface SetupGatewayInput {
  accountId: string;
  companyId: string;
  /**
   * Carteira já existente a adotar. O grupo já opera contas "Pagar-me …" com o
   * histórico manual dentro; adotar preserva saldo e extrato — criar uma nova
   * deixaria esse histórico órfão. Null = a RPC cria `pagar.me — <slug>`.
   */
  gatewayBankAccountId: string | null;
  payoutBankAccountId: string | null;
  cutoverDate: string;
}

export async function setupGatewayAccount(input: SetupGatewayInput): Promise<string> {
  const { data, error } = await supabase.rpc("pagarme_setup_gateway_account", {
    p_account_id: input.accountId,
    p_company_id: input.companyId,
    p_gateway_bank_account_id: input.gatewayBankAccountId ?? undefined,
    p_payout_bank_account_id: input.payoutBankAccountId ?? undefined,
    p_cutover_date: input.cutoverDate,
  });
  if (error) throw error;
  return data;
}

/** Kill-switch da projeção. Desligar não apaga nada — só para de recalcular. */
export async function setProjectionEnabled(settingsId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("pagarme_ledger_settings")
    .update({ enabled })
    .eq("id", settingsId);
  if (error) throw error;
}

export interface ProjectionResultRow {
  kind: string;
  entries: number;
  amount: number;
}

/**
 * Recalcula os lançamentos da janela a partir dos recebíveis vigentes.
 *
 * Idempotente: rodar de novo reconcilia em vez de duplicar. É o passo que faz o
 * recebível aparecer em "A Receber" e no forecast.
 */
export async function projectLedger(
  companyId: string,
  from: string,
  to: string,
  accountId: string | null = null,
): Promise<ProjectionResultRow[]> {
  const { data, error } = await supabase.rpc("pagarme_project_ledger", {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
    p_pagarme_account_id: accountId ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    kind: r.kind ?? "",
    entries: r.lancamentos ?? 0,
    amount: r.valor ?? 0,
  }));
}

/**
 * Dispara a carga histórica de uma conexão.
 *
 * Só enfileira: o cron `pagarme-backfill` drena o lote em blocos, de forma
 * retomável. Lote já em andamento para a mesma conexão devolve o mesmo id.
 */
export async function startBackfill(
  accountId: string,
  windowStart: string,
  windowEnd: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("pagarme_start_backfill", {
    p_account_id: accountId,
    p_window_start: windowStart,
    p_window_end: windowEnd,
  });
  if (error) throw error;
  return data;
}

export interface SyncRun {
  id: string;
  pagarmeAccountId: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  pageCursor: number;
  itemsSeen: number;
  itemsWritten: number;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchSyncRuns(): Promise<SyncRun[]> {
  const { data, error } = await supabase
    .from("pagarme_sync_runs")
    .select(
      "id, pagarme_account_id, status, window_start, window_end, page_cursor, items_seen, items_written, attempts, last_error, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    pagarmeAccountId: r.pagarme_account_id,
    status: r.status,
    windowStart: r.window_start,
    windowEnd: r.window_end,
    pageCursor: r.page_cursor,
    itemsSeen: r.items_seen,
    itemsWritten: r.items_written,
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export interface ReconcileMonthRow {
  metric: string;
  value: number;
  detail: string;
}

/** Conciliação do mês: liquidado x projetado x saques. `divergencia_*` deve ser zero. */
export async function fetchReconcileMonth(
  companyId: string,
  month: string,
): Promise<ReconcileMonthRow[]> {
  const { data, error } = await supabase.rpc("pagarme_reconcile_month", {
    p_company_id: companyId,
    p_month: month,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    metric: r.metric,
    value: r.value ?? 0,
    detail: r.detail,
  }));
}

export interface ReconcilePayoutInput {
  companyId: string;
  amount: number;
  fundedOn: string;
  /** Chave de idempotência: reenviar a mesma referência devolve o saque já criado. */
  externalRef: string;
  bankAccountId: string | null;
  notes: string | null;
}

/**
 * Registra o saque do pagar.me como TRANSFERÊNCIA gateway → banco.
 *
 * É a operação que substitui o processo manual: em vez de lançar a TED como
 * receita (o que produzia o spike), ela vira as duas pernas de uma transferência,
 * que a `v_transactions` mantém fora da DRE e do fluxo.
 */
export async function reconcilePayout(input: ReconcilePayoutInput): Promise<string> {
  const { data, error } = await supabase.rpc("pagarme_reconcile_payout", {
    p_company_id: input.companyId,
    p_amount: input.amount,
    p_funded_on: input.fundedOn,
    p_external_ref: input.externalRef,
    p_bank_account_id: input.bankAccountId ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  if (error) throw error;
  return data;
}
