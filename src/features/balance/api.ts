import { supabase, type Enums } from "@/lib/supabase";

import type { BalanceDrilldown, MonthlySeriesRow } from "./compute";
import {
  DATE_COLUMN_BY_BASIS,
  directionForMeasure,
  STATUSES_BY_BASIS,
  unclassifiedOrFilter,
  type AccountingBasis,
} from "./drilldown";
import { parseBalanceLines, type BalanceLine } from "./schema";
import type { BalanceScope } from "./scope";

/**
 * Série mensal do escopo. Continua por `cost_center_id` (não pela chave de
 * consolidação) porque as linhas do modelo referenciam centros específicos — é isso
 * que permite uma linha somar o "Capex" de três empresas.
 */
export async function fetchMonthlySeries(
  companyIds: string[] | null,
  from: string,
  to: string,
  basis: AccountingBasis,
): Promise<MonthlySeriesRow[]> {
  const { data, error } = await supabase.rpc("cost_center_monthly_series_multi", {
    p_company_ids: companyIds ?? undefined,
    p_from: from,
    p_to: to,
    p_basis: basis,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    month: r.month,
    costCenterId: r.cost_center_id,
    revenue: r.revenue,
    expense: r.expense,
  }));
}

/** Filtro que isola a linha do escopo. Consolidado é "sem empresa e sem grupo". */
function scopeFilter<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(
  query: T,
  scope: BalanceScope,
  organizationId: string,
): T {
  if (scope.kind === "company") return query.eq("company_id", scope.companyId);
  if (scope.kind === "group") return query.eq("company_group_id", scope.groupId);
  return query
    .eq("organization_id", organizationId)
    .is("company_id", null)
    .is("company_group_id", null);
}

/** Modelo do escopo. Escopo sem modelo ainda devolve lista vazia, não erro. */
export async function fetchBalanceModel(
  scope: BalanceScope,
  organizationId: string,
): Promise<BalanceLine[]> {
  const { data, error } = await scopeFilter(
    supabase.from("balance_report_models").select("lines"),
    scope,
    organizationId,
  ).maybeSingle();
  if (error) throw error;
  return parseBalanceLines(data?.lines);
}

/**
 * Grava o modelo do escopo.
 *
 * Lê-então-escreve em vez de `upsert`: os únicos do escopo são índices PARCIAIS
 * (`where company_id is not null`, etc.), e inferência de conflito com índice parcial
 * é frágil. Duas idas ao banco num salvamento de configuração não custam nada, e o
 * caminho fica explícito.
 */
export async function saveBalanceModel(
  scope: BalanceScope,
  organizationId: string,
  lines: BalanceLine[],
): Promise<BalanceLine[]> {
  const { data: existing, error: findError } = await scopeFilter(
    supabase.from("balance_report_models").select("id"),
    scope,
    organizationId,
  ).maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { data, error } = await supabase
      .from("balance_report_models")
      .update({ lines })
      .eq("id", existing.id)
      .select("lines")
      .single();
    if (error) throw error;
    return parseBalanceLines(data.lines);
  }

  const { data, error } = await supabase
    .from("balance_report_models")
    .insert({
      organization_id: organizationId,
      company_id: scope.kind === "company" ? scope.companyId : null,
      company_group_id: scope.kind === "group" ? scope.groupId : null,
      lines,
    })
    .select("lines")
    .single();
  if (error) throw error;
  return parseBalanceLines(data.lines);
}

/* ─── Lançamentos por trás de uma linha ──────────────────────────────────── */

const LINE_TX_SELECT = `
  id, accrual_date, cash_date, description, amount, direction, status, document_ref,
  account:chart_of_accounts!transactions_account_id_fkey(code, name),
  cost_center:cost_centers!transactions_cost_center_id_fkey(id, name),
  counterparty:counterparties!transactions_counterparty_id_fkey(name)
` as const;

export interface LineTransaction {
  id: string;
  accrual_date: string;
  cash_date: string | null;
  description: string;
  amount: number;
  direction: Enums["transaction_direction"];
  status: Enums["transaction_status"];
  document_ref: string | null;
  account: { code: string; name: string } | null;
  cost_center: { id: string; name: string } | null;
  counterparty: { name: string } | null;
}

/**
 * Teto da listagem. Um centro com um ano de movimento passa de mil lançamentos, e
 * a gaveta é para conferir a composição, não para paginar o extrato inteiro —
 * quem precisa disso vai para /transactions com os filtros.
 */
export const LINE_TRANSACTIONS_LIMIT = 500;

export interface LineTransactionsResult {
  rows: LineTransaction[];
  /** Total que casa com o filtro, mesmo quando a listagem é truncada. */
  totalCount: number;
}

export async function fetchLineTransactions(params: {
  companyIds: string[] | null;
  from: string;
  to: string;
  drilldown: BalanceDrilldown;
  basis: AccountingBasis;
}): Promise<LineTransactionsResult> {
  const { companyIds, from, to, drilldown, basis } = params;

  // A data e os status vêm do regime: a lista precisa dos mesmos filtros da
  // série, senão ela não soma o número da célula que foi clicada.
  const dateColumn = DATE_COLUMN_BY_BASIS[basis];

  let query = supabase
    .from("transactions")
    .select(LINE_TX_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .gte(dateColumn, from)
    .lte(dateColumn, to)
    .in("status", [...STATUSES_BY_BASIS[basis]]);

  if (companyIds) query = query.in("company_id", companyIds);

  if (drilldown.kind === "cost_centers") {
    // Sem centro nenhum a linha vale zero; `in.()` vazio seria erro de sintaxe.
    if (drilldown.costCenterIds.length === 0) return { rows: [], totalCount: 0 };
    query = query.in("cost_center_id", drilldown.costCenterIds);

    const direction = directionForMeasure(drilldown.measure);
    if (direction) query = query.eq("direction", direction);
  } else {
    query = query.or(unclassifiedOrFilter(drilldown));
  }

  const { data, error, count } = await query
    .order(dateColumn, { ascending: false })
    .order("amount", { ascending: false })
    .limit(LINE_TRANSACTIONS_LIMIT);

  if (error) throw error;
  return { rows: (data ?? []) as unknown as LineTransaction[], totalCount: count ?? 0 };
}
