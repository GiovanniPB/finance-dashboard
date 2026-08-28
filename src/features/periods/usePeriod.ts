/**
 * Período do relatório, persistido na URL (compartilhável e sobrevive ao reload).
 *
 * Usado pela DRE e pelos relatórios gerenciais — os presets são os mesmos nos dois
 * lugares de propósito: "últimos 12 meses" tem que significar a mesma janela.
 */
import { endOfMonth, endOfYear, startOfMonth, startOfYear, subMonths, subYears } from "date-fns";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import { isoDate } from "@/lib/dates";

/** A ordem aqui é a ordem do seletor. */
export const PRESETS = [
  "current_month",
  "last_month",
  "ytd",
  "current_year",
  "last_year",
  "last_12_months",
  "custom",
] as const;
export type PeriodPreset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  current_month: "Mês atual",
  last_month: "Mês anterior",
  ytd: "No ano (YTD)",
  current_year: "Ano atual",
  last_year: "Ano anterior",
  last_12_months: "Últimos 12 meses",
  custom: "Personalizado",
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
    case "current_year":
      return { from: isoDate(startOfYear(now)), to: isoDate(endOfYear(now)) };
    case "last_year": {
      const ly = subYears(now, 1);
      return { from: isoDate(startOfYear(ly)), to: isoDate(endOfYear(ly)) };
    }
    case "last_12_months":
      // 11 meses para trás + o mês atual = 12 meses. Subtrair 12 daria 13 janelas
      // mensais, o que aparecia como uma linha a mais na matriz do balanço.
      return { from: isoDate(subMonths(startOfMonth(now), 11)), to: isoDate(endOfMonth(now)) };
    case "custom":
      return { from: "", to: "" };
  }
}

/** Resolve o período efetivo: no modo personalizado vale o que está na URL. */
export function effectiveRange(period: { preset: PeriodPreset; from: string; to: string }): {
  from: string;
  to: string;
} {
  return period.preset === "custom"
    ? { from: period.from, to: period.to }
    : resolvePreset(period.preset);
}

export function usePeriod() {
  return useQueryStates({
    preset: parseAsStringLiteral(PRESETS).withDefault("ytd"),
    from: parseAsString.withDefault(""),
    to: parseAsString.withDefault(""),
  });
}
