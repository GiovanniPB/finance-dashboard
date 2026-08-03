/**
 * Resolução de período e de comparativo — funções puras.
 *
 * Toda aritmética usa `Date` local (mesma abordagem do resto do app, ver
 * `src/routes/reports.tsx`) para evitar deslocamento de fuso: as datas do
 * relatório são civis (`YYYY-MM-DD`), não instantes.
 *
 * `ref` é sempre parâmetro para os testes serem determinísticos.
 */
import { formatDate, formatMonthYear } from "@/lib/dates";

import type { ReportComparison, ReportPeriod } from "./schema";

export interface ResolvedPeriod {
  from: string;
  to: string;
  label: string;
}

/* ─── Utilitários de data civil ───────────────────────────────────────── */

const pad = (n: number): string => String(n).padStart(2, "0");

function iso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIso(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Dia 0 do mês seguinte = último dia do mês pedido. */
function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

function addDays(value: string, days: number): string {
  const d = parseIso(value);
  d.setDate(d.getDate() + days);
  return iso(d);
}

function daysBetweenInclusive(from: string, to: string): number {
  const ms = parseIso(to).getTime() - parseIso(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Início (dia 1) do mês deslocado em `months` a partir de `value`. */
function firstDayOfShiftedMonth(value: string, months: number): string {
  const d = parseIso(value);
  return iso(new Date(d.getFullYear(), d.getMonth() + months, 1));
}

/** Último dia do mês deslocado em `months` a partir de `value`. */
function lastDayOfShiftedMonth(value: string, months: number): string {
  const d = parseIso(value);
  return iso(lastDayOfMonth(d.getFullYear(), d.getMonth() + months));
}

function isFirstDayOfMonth(value: string): boolean {
  return parseIso(value).getDate() === 1;
}

function isLastDayOfMonth(value: string): boolean {
  const d = parseIso(value);
  return d.getDate() === lastDayOfMonth(d.getFullYear(), d.getMonth()).getDate();
}

/** O período cobre meses inteiros? Define se o MoM desloca mês ou dia. */
function isMonthAligned(from: string, to: string): boolean {
  return isFirstDayOfMonth(from) && isLastDayOfMonth(to);
}

/** Quantidade de meses civis cobertos por um período alinhado a mês. */
function monthSpan(from: string, to: string): number {
  const a = parseIso(from);
  const b = parseIso(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
}

/**
 * Rótulo mais legível possível para um intervalo:
 * mês inteiro → "julho de 2026"; ano civil → "2026"; resto → "dd/MM → dd/MM".
 */
export function labelForRange(from: string, to: string): string {
  if (isMonthAligned(from, to)) {
    const span = monthSpan(from, to);
    if (span === 1) return formatMonthYear(from);
    const a = parseIso(from);
    const b = parseIso(to);
    if (span === 12 && a.getMonth() === 0 && a.getFullYear() === b.getFullYear()) {
      return String(a.getFullYear());
    }
    return `${formatMonthYear(from)} → ${formatMonthYear(to)}`;
  }
  return `${formatDate(from)} → ${formatDate(to)}`;
}

/**
 * Rótulo curto, para caber em cabeçalho de coluna de tabela.
 *
 * `labelForRange` produz coisas como "2026 (até 31/07/2026)", que quebram em duas
 * linhas numa coluna de 28mm e desalinham a altura do cabeçalho.
 * Mês inteiro → "jul/26"; ano civil → "2026"; resto → "01/01–31/07".
 */
export function compactLabelForRange(from: string, to: string): string {
  const a = parseIso(from);
  const b = parseIso(to);

  if (isMonthAligned(from, to)) {
    const span = monthSpan(from, to);
    if (span === 1) return formatDate(from, "MMM/yy").replace(".", "");
    if (span === 12 && a.getMonth() === 0 && a.getFullYear() === b.getFullYear()) {
      return String(a.getFullYear());
    }
  }
  if (a.getFullYear() === b.getFullYear() && isFirstDayOfMonth(from) && a.getMonth() === 0) {
    return `${a.getFullYear()} até ${formatDate(to, "dd/MM")}`;
  }
  return `${formatDate(from, "dd/MM")}–${formatDate(to, "dd/MM")}`;
}

/* ─── Resolução ───────────────────────────────────────────────────────── */

const QUARTER_MONTHS = 3;

/** Converte a config de período no intervalo concreto usado nas consultas. */
export function resolvePeriod(period: ReportPeriod, ref: Date = new Date()): ResolvedPeriod {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const quarterStart = Math.floor(m / QUARTER_MONTHS) * QUARTER_MONTHS;

  switch (period.preset) {
    case "current_month":
      return range(iso(new Date(y, m, 1)), iso(lastDayOfMonth(y, m)));

    case "last_month":
      return range(iso(new Date(y, m - 1, 1)), iso(lastDayOfMonth(y, m - 1)));

    case "current_quarter":
      return quarterRange(y, quarterStart);

    case "last_quarter":
      return quarterRange(y, quarterStart - QUARTER_MONTHS);

    case "ytd": {
      const from = iso(new Date(y, 0, 1));
      const to = iso(ref);
      return { from, to, label: `${y} (até ${formatDate(to)})` };
    }

    case "last_12m": {
      const from = iso(new Date(y, m - 11, 1));
      const to = iso(ref);
      return { from, to, label: `Últimos 12 meses (até ${formatDate(to)})` };
    }

    case "custom": {
      // O schema garante ambas as datas quando o preset é "custom"; o fallback
      // existe só para satisfazer o tipo sem `as`.
      const from = period.from ?? iso(new Date(y, m, 1));
      const to = period.to ?? iso(ref);
      return range(from, to);
    }
  }
}

function range(from: string, to: string): ResolvedPeriod {
  return { from, to, label: labelForRange(from, to) };
}

function quarterRange(year: number, startMonth: number): ResolvedPeriod {
  const from = new Date(year, startMonth, 1);
  const to = lastDayOfMonth(year, startMonth + QUARTER_MONTHS - 1);
  const quarter = Math.floor(from.getMonth() / QUARTER_MONTHS) + 1;
  return {
    from: iso(from),
    to: iso(to),
    label: `${quarter}º trimestre de ${from.getFullYear()}`,
  };
}

/**
 * Período de comparação.
 *
 * - `yoy`: mesmo intervalo um ano antes. Dia inexistente no mês de destino
 *   (29/02 → ano não bissexto) é truncado para o último dia do mês.
 * - `mom`: período imediatamente anterior de mesma duração. Quando o período
 *   cobre meses inteiros, desloca **meses civis** (junho → maio, e não "30 dias
 *   antes"); caso contrário desloca a mesma quantidade de dias.
 */
export function resolveComparison(
  period: ResolvedPeriod,
  comparison: ReportComparison,
): ResolvedPeriod | null {
  if (comparison === "none") return null;

  if (comparison === "yoy") {
    return range(shiftYear(period.from), shiftYear(period.to));
  }

  if (isMonthAligned(period.from, period.to)) {
    const span = monthSpan(period.from, period.to);
    return range(
      firstDayOfShiftedMonth(period.from, -span),
      lastDayOfShiftedMonth(period.from, -1),
    );
  }

  const span = daysBetweenInclusive(period.from, period.to);
  return range(addDays(period.from, -span), addDays(period.from, -1));
}

/** Um ano para trás, truncando o dia ao último dia do mês de destino. */
function shiftYear(value: string): string {
  const d = parseIso(value);
  const year = d.getFullYear() - 1;
  const month = d.getMonth();
  const maxDay = lastDayOfMonth(year, month).getDate();
  return iso(new Date(year, month, Math.min(d.getDate(), maxDay)));
}
