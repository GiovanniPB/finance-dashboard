import { supabase } from "@/lib/supabase";

import type { BankAccountBalance, CashflowPeriod } from "./types";

export async function fetchCashflowDaily(
  companyId: string,
  from: string,
  to: string,
): Promise<CashflowPeriod[]> {
  const { data, error } = await supabase.rpc("cashflow_daily", {
    p_company_id: companyId,
    p_start: from,
    p_end: to,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    bucket: r.day,
    inflow: r.inflow,
    outflow: r.outflow,
    net: r.net,
  }));
}

export async function fetchCashflowMonthly(
  companyId: string,
  year: number,
): Promise<CashflowPeriod[]> {
  const { data, error } = await supabase.rpc("cashflow_monthly", {
    p_company_id: companyId,
    p_year: year,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    bucket: r.month_start,
    inflow: r.inflow,
    outflow: r.outflow,
    net: r.net,
  }));
}

/** Saldo de cada conta na data `asOf` (ISO YYYY-MM-DD). */
export async function fetchBankBalances(
  companyId: string,
  asOf: string,
): Promise<BankAccountBalance[]> {
  const { data, error } = await supabase.rpc("bank_balances", {
    p_company_id: companyId,
    p_as_of: asOf,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    bank_account_id: r.bank_account_id,
    bank_name: r.bank_name,
    nickname: r.nickname,
    account_type: r.account_type,
    initial_balance: r.initial_balance,
    inflow: r.inflow,
    outflow: r.outflow,
    closing_balance: r.closing_balance,
  }));
}
