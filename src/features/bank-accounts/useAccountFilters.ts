import { parseAsString, useQueryStates } from "nuqs";

import { isoDate } from "@/lib/dates";

/** Primeiro dia do mês corrente. */
function defaultFrom(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** Último dia do mês corrente. */
function defaultTo(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

/** Período do extrato, compartilhável pela URL. */
export function useAccountFilters() {
  return useQueryStates({
    from: parseAsString.withDefault(defaultFrom()),
    to: parseAsString.withDefault(defaultTo()),
  });
}

export interface PeriodPreset {
  label: string;
  from: string;
  to: string;
}

/** Atalhos de período oferecidos no extrato. */
export function periodPresets(reference: Date = new Date()): PeriodPreset[] {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  const startOfMonth = new Date(y, m, 1);
  const endOfMonth = new Date(y, m + 1, 0);
  const prevMonthStart = new Date(y, m - 1, 1);
  const prevMonthEnd = new Date(y, m, 0);

  return [
    { label: "Este mês", from: isoDate(startOfMonth), to: isoDate(endOfMonth) },
    { label: "Mês passado", from: isoDate(prevMonthStart), to: isoDate(prevMonthEnd) },
    {
      label: "Últimos 90 dias",
      from: isoDate(new Date(y, m, reference.getDate() - 89)),
      to: isoDate(reference),
    },
    { label: "Este ano", from: `${y}-01-01`, to: `${y}-12-31` },
  ];
}
