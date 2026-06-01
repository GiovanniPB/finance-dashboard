import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

const GRANULARITIES = ["daily", "monthly"] as const;

export function useCashflowFilters() {
  return useQueryStates({
    granularity: parseAsStringLiteral(GRANULARITIES).withDefault("monthly"),
    year: parseAsInteger.withDefault(new Date().getFullYear()),
    // 0 = ano inteiro; 1-12 = mês específico (força visão diária do mês).
    month: parseAsInteger.withDefault(0),
  });
}
