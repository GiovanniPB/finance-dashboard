import { endOfMonth, endOfYear, format, parseISO, startOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";

export const TZ = "America/Sao_Paulo";

export function formatDate(value: string | Date, pattern = "dd/MM/yyyy"): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, pattern, { locale: ptBR });
}

export function formatMonthYear(value: string | Date): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "MMM yyyy", { locale: ptBR });
}

export function formatMonthLabel(value: string | Date): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "MMMM", { locale: ptBR });
}

export function monthBounds(date: Date = new Date()): { start: string; end: string } {
  return {
    start: format(startOfMonth(date), "yyyy-MM-dd"),
    end: format(endOfMonth(date), "yyyy-MM-dd"),
  };
}

export function yearBounds(year: number): { start: string; end: string } {
  return {
    start: format(startOfYear(new Date(year, 0, 1)), "yyyy-MM-dd"),
    end: format(endOfYear(new Date(year, 0, 1)), "yyyy-MM-dd"),
  };
}

export function isoDate(date: Date = new Date()): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Limites de um dia (YYYY-MM-DD) como instante ISO/UTC, interpretando a data no
 * fuso local — a mesma referência que `formatDate` usa para exibir. Use para
 * filtrar colunas `timestamptz` por período sem deslocar a janela.
 */
export function dayStartIso(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

export function dayEndIso(date: string): string {
  return new Date(`${date}T23:59:59.999`).toISOString();
}
