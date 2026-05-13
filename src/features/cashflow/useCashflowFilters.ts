import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

const GRANULARITIES = ["daily", "monthly"] as const;

export function useCashflowFilters() {
  return useQueryStates({
    granularity: parseAsStringLiteral(GRANULARITIES).withDefault("monthly"),
    year: parseAsInteger.withDefault(new Date().getFullYear()),
  });
}
