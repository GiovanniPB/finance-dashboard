import { supabase, type Enums, type Tables } from "@/lib/supabase";

import type { AssessmentInputs, AssessmentResult } from "./apuracao";

export type TaxObligation = Tables["tax_obligations"]["Row"];
export type TaxObligationKind = Enums["tax_obligation_kind"];
export type TaxObligationStatus = Enums["tax_obligation_status"];

export interface ListFilters {
  /** `null` = sem recorte (limita a RLS); array = exatamente estas empresas. */
  companyIds: string[] | null;
  status?: TaxObligationStatus[];
  from?: string;
  to?: string;
}

export async function fetchTaxObligations(filters: ListFilters): Promise<TaxObligation[]> {
  let query = supabase.from("tax_obligations").select("*");
  if (filters.companyIds) query = query.in("company_id", filters.companyIds);
  if (filters.status && filters.status.length > 0) query = query.in("status", filters.status);
  if (filters.from) query = query.gte("due_date", filters.from);
  if (filters.to) query = query.lte("due_date", filters.to);
  query = query.order("due_date", { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function generateTaxObligations(
  companyId: string,
  referencePeriod: string,
): Promise<TaxObligation[]> {
  const { data, error } = await supabase.rpc("generate_tax_obligations", {
    p_company_id: companyId,
    p_reference_period: referencePeriod,
  });
  if (error) throw error;
  return data ?? [];
}

export interface MarkPaidInput {
  obligationId: string;
  paidAt: string;
  bankAccountId: string;
  accountId: string;
  actualAmount: number | null;
}

export async function markTaxPaid(input: MarkPaidInput): Promise<TaxObligation> {
  const { data, error } = await supabase.rpc("mark_tax_paid", {
    p_obligation_id: input.obligationId,
    p_paid_at: input.paidAt,
    p_bank_account_id: input.bankAccountId,
    p_account_id: input.accountId,
    p_actual_amount: input.actualAmount ?? undefined,
  });
  if (error) throw error;
  return data;
}

export async function updateTaxObligation(
  id: string,
  payload: Partial<Tables["tax_obligations"]["Update"]>,
): Promise<TaxObligation> {
  const { data, error } = await supabase
    .from("tax_obligations")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTaxObligation(id: string): Promise<void> {
  const { error } = await supabase.from("tax_obligations").delete().eq("id", id);
  if (error) throw error;
}

export async function markOverdueObligations(companyId: string): Promise<number> {
  const { data, error } = await supabase.rpc("mark_overdue_obligations", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return data ?? 0;
}

// ---------------------------------------------------------------------------
// Apuração
//
// O fluxo é: `fetchAssessmentInputs` (banco colhe a base sob RLS) ->
// `computeAssessment` (motor compartilhado faz a aritmética) -> `saveAssessment`
// (banco grava e confere a coerência) -> `confirmAssessment` (gera a obrigação).
// ---------------------------------------------------------------------------

export type TaxRuleRow = Tables["tax_rules"]["Row"];
export type TaxRulePresumption = Tables["tax_rule_presumptions"]["Row"];
export type TaxAssessment = Tables["tax_assessments"]["Row"];
export type TaxAssessmentLine = Tables["tax_assessment_lines"]["Row"];
export type TaxPeriodKind = Enums["tax_period_kind"];
export type TaxPresumptionClass = Enums["tax_presumption_class"];
export type TaxAssessmentLineKind = Enums["tax_assessment_line_kind"];

export interface TaxRuleWithTiers extends TaxRuleRow {
  tax_rule_presumptions: TaxRulePresumption[];
}

export async function fetchTaxRules(companyIds: string[] | null): Promise<TaxRuleWithTiers[]> {
  let query = supabase
    .from("tax_rules")
    .select("*, tax_rule_presumptions(*)")
    .order("kind", { ascending: true })
    .order("valid_from", { ascending: false });
  if (companyIds) query = query.in("company_id", companyIds);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function upsertTaxRule(
  payload: Tables["tax_rules"]["Insert"] & { id?: string },
): Promise<TaxRuleRow> {
  const { data, error } = await supabase
    .from("tax_rules")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function replaceRulePresumptions(
  ruleId: string,
  tiers: Omit<Tables["tax_rule_presumptions"]["Insert"], "rule_id">[],
): Promise<void> {
  const del = await supabase.from("tax_rule_presumptions").delete().eq("rule_id", ruleId);
  if (del.error) throw del.error;
  if (tiers.length === 0) return;
  const ins = await supabase
    .from("tax_rule_presumptions")
    .insert(tiers.map((t) => ({ ...t, rule_id: ruleId })));
  if (ins.error) throw ins.error;
}

export async function deleteTaxRule(id: string): Promise<void> {
  const { error } = await supabase.from("tax_rules").delete().eq("id", id);
  if (error) throw error;
}

/** Insumos da apuração: regra vigente, faixas, base colhida e linhas manuais. */
export async function fetchAssessmentInputs(
  companyId: string,
  kind: TaxObligationKind,
  periodDate: string,
): Promise<AssessmentInputs & { assessment: { id: string; status: string } | null }> {
  const { data, error } = await supabase.rpc("tax_assessment_inputs", {
    p_company_id: companyId,
    p_kind: kind,
    p_period_date: periodDate,
  });
  if (error) throw error;
  return data as unknown as AssessmentInputs & {
    assessment: { id: string; status: string } | null;
  };
}

export async function saveAssessment(result: AssessmentResult): Promise<TaxAssessment> {
  const { data, error } = await supabase.rpc("save_tax_assessment", {
    p_payload: result as unknown as never,
  });
  if (error) throw error;
  return data;
}

export async function confirmAssessment(assessmentId: string): Promise<TaxObligation> {
  const { data, error } = await supabase.rpc("confirm_tax_assessment", {
    p_assessment_id: assessmentId,
  });
  if (error) throw error;
  return data;
}

export async function reopenAssessment(assessmentId: string): Promise<TaxAssessment> {
  const { data, error } = await supabase.rpc("reopen_tax_assessment", {
    p_assessment_id: assessmentId,
  });
  if (error) throw error;
  return data;
}

export async function fetchAssessments(filters: {
  companyIds: string[] | null;
  from?: string;
  to?: string;
}): Promise<TaxAssessment[]> {
  let query = supabase
    .from("tax_assessments")
    .select("*")
    .order("period_start", { ascending: false });
  if (filters.companyIds) query = query.in("company_id", filters.companyIds);
  if (filters.from) query = query.gte("period_start", filters.from);
  if (filters.to) query = query.lte("period_start", filters.to);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchAssessmentLines(assessmentId: string): Promise<TaxAssessmentLine[]> {
  const { data, error } = await supabase
    .from("tax_assessment_lines")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("line_kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
