import { endOfMonth, startOfMonth, startOfYear, subMonths, subYears } from "date-fns";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { isoDate } from "@/lib/dates";

const PRESETS = [
  "current_month",
  "last_month",
  "ytd",
  "last_12_months",
  "last_year",
  "custom",
] as const;
export type PeriodPreset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  current_month: "Mês atual",
  last_month: "Mês passado",
  ytd: "YTD",
  last_12_months: "Últimos 12 meses",
  last_year: "Ano anterior",
  custom: "Customizado",
};

export function resolvePreset(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case "current_month":
      return { from: isoDate(startOfMonth(now)), to: isoDate(endOfMonth(now)) };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { from: isoDate(startOfMonth(prev)), to: isoDate(endOfMonth(prev)) };
    }
    case "ytd":
      return { from: isoDate(startOfYear(now)), to: isoDate(endOfMonth(now)) };
    case "last_12_months":
      return { from: isoDate(subMonths(startOfMonth(now), 12)), to: isoDate(endOfMonth(now)) };
    case "last_year": {
      const ly = subYears(now, 1);
      return {
        from: isoDate(startOfYear(ly)),
        to: isoDate(endOfMonth(new Date(ly.getFullYear(), 11, 31))),
      };
    }
    case "custom":
      return { from: "", to: "" };
  }
}

/**
 * Period state persisted in the URL.
 * Default: YTD of the current year — but for this project we default to 2025
 * since most data lives there during dev.
 */
export function usePeriod() {
  return useQueryStates({
    preset: parseAsStringLiteral(PRESETS).withDefault("ytd"),
    from: parseAsString.withDefault(""),
    to: parseAsString.withDefault(""),
  });
}
