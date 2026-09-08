import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Tables } from "@/lib/supabase";

import {
  confirmAssessment,
  deleteTaxObligation,
  deleteTaxRule,
  fetchAssessmentInputs,
  fetchAssessmentLines,
  fetchAssessments,
  fetchTaxObligations,
  fetchTaxRules,
  generateTaxObligations,
  markOverdueObligations,
  markTaxPaid,
  reopenAssessment,
  replaceRulePresumptions,
  saveAssessment,
  updateTaxObligation,
  upsertTaxRule,
  type ListFilters,
  type MarkPaidInput,
  type TaxObligationKind,
} from "./api";
import type { AssessmentResult } from "./apuracao";

export const taxKeys = {
  list: (f: ListFilters) => ["taxes", "list", f] as const,
};

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["taxes"] });
  void qc.invalidateQueries({ queryKey: ["transactions"] });
  void qc.invalidateQueries({ queryKey: ["bills"] });
  void qc.invalidateQueries({ queryKey: ["dre"] });
}

const EMPTY_FILTERS: ListFilters = { companyIds: [] };

export function useTaxObligations(filters: ListFilters | null) {
  const effective = filters ?? EMPTY_FILTERS;
  return useQuery({
    queryKey: taxKeys.list(effective),
    queryFn: () => fetchTaxObligations(effective),
    enabled: filters !== null,
  });
}

export function useGenerateTaxObligations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, referencePeriod }: { companyId: string; referencePeriod: string }) =>
      generateTaxObligations(companyId, referencePeriod),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useMarkTaxPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MarkPaidInput) => markTaxPaid(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateTaxObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Tables["tax_obligations"]["Update"]>;
    }) => updateTaxObligation(id, payload),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteTaxObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTaxObligation(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useMarkOverdue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => markOverdueObligations(companyId),
    onSuccess: () => invalidateAll(qc),
  });
}

// ---------------------------------------------------------------------------
// Apuração
// ---------------------------------------------------------------------------

export const apuracaoKeys = {
  rules: (companyIds: string[] | null) => ["taxes", "rules", companyIds] as const,
  inputs: (companyId: string, kind: string, period: string) =>
    ["taxes", "inputs", companyId, kind, period] as const,
  assessments: (f: { companyIds: string[] | null; from?: string; to?: string }) =>
    ["taxes", "assessments", f] as const,
  lines: (assessmentId: string) => ["taxes", "lines", assessmentId] as const,
};

export function useTaxRules(companyIds: string[] | null) {
  return useQuery({
    queryKey: apuracaoKeys.rules(companyIds),
    queryFn: () => fetchTaxRules(companyIds),
    // Recorte vazio não é "todas as empresas": um grupo ainda carregando expõe `[]`.
    enabled: companyIds === null || companyIds.length > 0,
  });
}

export function useUpsertTaxRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rule,
      tiers,
    }: {
      rule: Tables["tax_rules"]["Insert"] & { id?: string };
      tiers?: Omit<Tables["tax_rule_presumptions"]["Insert"], "rule_id">[];
    }) => {
      const saved = await upsertTaxRule(rule);
      if (tiers) await replaceRulePresumptions(saved.id, tiers);
      return saved;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteTaxRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTaxRule(id),
    onSuccess: () => invalidateAll(qc),
  });
}

/**
 * Insumos da apuração. `enabled` só quando há empresa, tributo e período — a regra é
 * de UMA empresa, então não existe apuração de escopo consolidado.
 */
export function useAssessmentInputs(
  companyId: string | null,
  kind: TaxObligationKind | null,
  periodDate: string | null,
) {
  return useQuery({
    queryKey: apuracaoKeys.inputs(companyId ?? "", kind ?? "", periodDate ?? ""),
    queryFn: () => {
      // A guarda repete o `enabled` porque o TanStack Query não estreita o tipo por
      // ele — e um insumo faltando aqui viraria apuração de período errado.
      if (!companyId || !kind || !periodDate) {
        throw new Error("Escolha empresa, imposto e competência para apurar.");
      }
      return fetchAssessmentInputs(companyId, kind, periodDate);
    },
    enabled: Boolean(companyId && kind && periodDate),
    retry: false,
  });
}

export function useSaveAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (result: AssessmentResult) => saveAssessment(result),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useConfirmAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assessmentId: string) => confirmAssessment(assessmentId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useReopenAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assessmentId: string) => reopenAssessment(assessmentId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAssessments(filters: {
  companyIds: string[] | null;
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: apuracaoKeys.assessments(filters),
    queryFn: () => fetchAssessments(filters),
    enabled: filters.companyIds === null || filters.companyIds.length > 0,
  });
}

export function useAssessmentLines(assessmentId: string | null) {
  return useQuery({
    queryKey: apuracaoKeys.lines(assessmentId ?? ""),
    queryFn: () => {
      if (!assessmentId) throw new Error("Apuração não informada.");
      return fetchAssessmentLines(assessmentId);
    },
    enabled: Boolean(assessmentId),
  });
}
