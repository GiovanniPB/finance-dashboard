/**
 * Recorte de vencimento da lista de títulos.
 *
 * Recorrências são materializadas 12 meses à frente, então a lista sem recorte
 * mostraria o ano inteiro de uma vez. O recorte é só **teto** de vencimento —
 * nunca piso — para que título vencido continue aparecendo em toda opção.
 */
import { addMonths, endOfMonth } from "date-fns";

import { isoDate } from "@/lib/dates";

export const DUE_HORIZONS = [
  { value: "month", label: "Até o fim do mês", months: 0 },
  { value: "3m", label: "Próximos 3 meses", months: 3 },
  { value: "12m", label: "Próximos 12 meses", months: 12 },
  { value: "all", label: "Sem limite", months: null },
] as const;

export type DueHorizon = (typeof DUE_HORIZONS)[number]["value"];

export const DEFAULT_DUE_HORIZON: DueHorizon = "3m";

/** Data-limite de vencimento, ou `null` quando não há teto. */
export function dueLimitFor(horizon: DueHorizon, today: Date = new Date()): string | null {
  const months = DUE_HORIZONS.find((h) => h.value === horizon)?.months;
  if (months == null) return null;
  return isoDate(endOfMonth(addMonths(today, months)));
}
