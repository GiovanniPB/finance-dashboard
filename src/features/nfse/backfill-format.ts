import type { BackfillRun } from "./api";

/** date (YYYY-MM-DD) do input -> ISO UTC (início/fim do dia). */
export function toIso(date: string, endOfDay: boolean): string {
  return `${date}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
}

/** ISO -> dd/mm/aaaa estável (sem deslocamento de fuso; usa só a parte da data). */
export function fmtWindow(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** % de progresso (charges_seen / total_charges); null se o total ainda não é conhecido. */
export function runProgress(run: BackfillRun): number | null {
  if (!run.total_charges || run.total_charges <= 0) return null;
  return Math.min(100, Math.round((run.charges_seen / run.total_charges) * 100));
}
