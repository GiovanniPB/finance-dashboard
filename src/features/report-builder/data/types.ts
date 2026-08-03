/**
 * Snapshot de dados do relatório.
 *
 * Cada campo é `null` quando nenhum bloco escolhido precisa dele — o fetch é
 * guiado pela composição, não pelo catálogo inteiro. As fases seguintes do plano
 * acrescentam campos aqui (KPIs, fluxo de caixa, centros de custo, etc.).
 */
import type { DreComputedRow } from "@/features/dre/types";

export interface ReportData {
  /** DRE do período principal, já com totais calculados. */
  dre: DreComputedRow[] | null;
}

export function emptyReportData(): ReportData {
  return { dre: null };
}
