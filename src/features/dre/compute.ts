/**
 * Cálculo dos totais da DRE.
 *
 * A implementação vive em `supabase/functions/_shared/mcp/dre-totais.ts` porque o
 * servidor MCP precisa exatamente da mesma regra — e o runtime do Deno não consegue
 * importar de `src/`, então a direção do compartilhamento é esta. Duas cópias da
 * regra significaria a IA e a tela discordando sobre o lucro líquido.
 *
 * Este módulo mantém a assinatura tipada com os tipos da feature.
 */
import { computeDreTotals as computeDreTotalsCompartilhado } from "../../../supabase/functions/_shared/mcp/dre-totais.ts";
import type { DreComputedRow, DreRow } from "./types";

export function computeDreTotals(rows: DreRow[]): DreComputedRow[] {
  return computeDreTotalsCompartilhado(rows);
}
