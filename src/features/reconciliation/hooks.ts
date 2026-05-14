import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteStatementLine,
  fetchStatementLines,
  ignoreStatementLine,
  importOfxLines,
  matchStatementLine,
  suggestCandidates,
  unmatchStatementLine,
  type ImportOfxInput,
  type ListFilters,
} from "./api";

export const reconciliationKeys = {
  list: (f: ListFilters) => ["reconciliation", "list", f] as const,
  candidates: (lineId: string) => ["reconciliation", "candidates", lineId] as const,
};

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["reconciliation"] });
  void qc.invalidateQueries({ queryKey: ["transactions"] });
  void qc.invalidateQueries({ queryKey: ["bills"] });
}

const EMPTY_FILTERS: ListFilters = { companyId: "" };

export function useStatementLines(filters: ListFilters | null) {
  const effective = filters ?? EMPTY_FILTERS;
  return useQuery({
    queryKey: reconciliationKeys.list(effective),
    queryFn: () => fetchStatementLines(effective),
    enabled: Boolean(filters?.companyId),
  });
}

export function useCandidates(lineId: string | null) {
  return useQuery({
    queryKey: reconciliationKeys.candidates(lineId ?? ""),
    queryFn: () => suggestCandidates(lineId ?? ""),
    enabled: Boolean(lineId),
  });
}

export function useImportOfx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportOfxInput) => importOfxLines(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useMatchLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, transactionId }: { lineId: string; transactionId: string }) =>
      matchStatementLine(lineId, transactionId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUnmatchLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => unmatchStatementLine(lineId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useIgnoreLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => ignoreStatementLine(lineId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => deleteStatementLine(lineId),
    onSuccess: () => invalidateAll(qc),
  });
}
