/**
 * Carregar a DRE de um período — a rotina que `get_dre`, `compare_periods` e
 * `monthly_briefing` compartilham.
 *
 * Extraída porque três tools precisam do MESMO número. A regra completa é:
 * escolher entre `dre_by_company` e `dre_consolidated`, converter `numeric` que o
 * PostgREST devolve como string, e aplicar `computeDreTotals` — sem o último passo
 * "(=) Resultado líquido" responde R$ 0,00, porque a RPC devolve zero nas linhas
 * totalizadoras e quem monta o valor é a hierarquia.
 *
 * Também é aqui que se resolve a limitação que motivou não usar a RPC
 * `dre_comparison` em `compare_periods`: ela devolve `total_a`/`total_b` mas **não**
 * devolve `parent_id` nem `below_the_line`, que são exatamente as colunas de que
 * `computeDreTotals` precisa para saber se uma totalizadora soma filhos ou marca
 * saldo corrente. Sem elas, toda totalizadora viraria marcador de saldo e
 * "(+) Venda Bruta" sairia errada. Chamar `dre_by_company` duas vezes custa o mesmo
 * (é o que a própria `dre_comparison` faz por dentro) e devolve a estrutura inteira.
 */
import { computeDreTotals, type ComTotaisEfetivos } from "./dre-totais.ts";
import { toNumber } from "./format.ts";
import type { McpDataSource, Regime } from "./types.ts";

interface DreRpcRow {
  /** `dre_by_company` devolve account_id; `dre_consolidated` devolve master_id. */
  account_id?: string;
  master_id?: string;
  parent_id: string | null;
  code: string;
  name: string;
  kind: string;
  dre_section: string | null;
  is_summary: boolean;
  below_the_line: boolean;
  sort_order: number;
  total: string | number | null;
  total_cash: string | number | null;
}

export interface DreLinha {
  account_id: string;
  parent_id: string | null;
  is_summary: boolean;
  below_the_line: boolean;
  sort_order: number;
  total: number;
  total_cash: number;
  code: string;
  name: string;
  dre_section: string | null;
  kind: string;
}

export type DreLinhaCalculada = ComTotaisEfetivos<DreLinha>;

export interface DreCarregada {
  /** Nome da RPC usada, para a proveniência. */
  fonte: string;
  linhas: DreLinhaCalculada[];
}

/** Valor da linha no regime pedido. */
export function valorNoRegime(linha: DreLinhaCalculada, regime: Regime): number {
  return regime === "caixa" ? linha.effective_total_cash : linha.effective_total;
}

export async function carregarDre(
  ds: McpDataSource,
  escopo: { companyId?: string; organizationId?: string },
  from: string,
  to: string,
): Promise<DreCarregada> {
  const fonte = escopo.companyId ? "dre_by_company" : "dre_consolidated";
  const rows = await ds.rpc<DreRpcRow>(fonte, {
    ...(escopo.companyId
      ? { p_company_id: escopo.companyId }
      : { p_organization_id: escopo.organizationId }),
    p_start: from,
    p_end: to,
  });

  const linhas = computeDreTotals<DreLinha>(
    rows.map((r) => ({
      account_id: r.account_id ?? r.master_id ?? r.code,
      parent_id: r.parent_id,
      is_summary: r.is_summary,
      below_the_line: r.below_the_line,
      sort_order: r.sort_order,
      total: toNumber(r.total),
      total_cash: toNumber(r.total_cash),
      code: r.code,
      name: r.name,
      dre_section: r.dre_section,
      kind: r.kind,
    })),
  );

  return { fonte, linhas };
}
