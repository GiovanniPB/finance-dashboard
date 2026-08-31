/**
 * Totais efetivos da DRE — a regra que transforma linhas de conta em demonstração.
 *
 * **Esta é a única implementação.** A tela (`src/features/dre/compute.ts`) reexporta
 * daqui, e a tool `get_dre` usa a mesma função. Não é preciosismo: as linhas
 * totalizadoras não existem no banco com valor — a RPC devolve zero nelas —, então
 * quem não aplicar esta regra responde "lucro líquido = R$ 0,00" com toda a
 * convicção. Duas implementações seria uma questão de tempo até a IA e a tela
 * discordarem, que é exatamente o que este projeto existe para impedir.
 *
 * Duas estratégias convivem:
 *
 * 1. **Totalizadora COM filhos** (ex.: "(+) Venda Bruta"): soma dos descendentes.
 * 2. **Totalizadora SEM filhos** (ex.: "(=) Venda Líquida", "(=) Margem de
 *    Contribuição"): marcador de saldo corrente — vale a soma acumulada das linhas
 *    de primeiro nível que vieram antes, ignorando as abaixo da linha.
 *
 * Sem dependências de propósito: roda no app (Vite), no Deno e no Worker.
 */

/** O mínimo que uma linha precisa ter. Estrutural, para servir aos dois lados. */
export interface DreLinhaBase {
  account_id: string;
  parent_id: string | null;
  is_summary: boolean;
  below_the_line: boolean;
  sort_order: number;
  total: number;
  total_cash: number;
}

export type ComTotaisEfetivos<T> = T & {
  effective_total: number;
  effective_total_cash: number;
  depth: number;
};

function computeBasis<T extends DreLinhaBase>(
  sorted: T[],
  childrenOf: Map<string, T[]>,
  pick: (row: T) => number,
): Map<string, number> {
  const totalsMap = new Map<string, number>();

  function effectiveTotal(row: T): number {
    const cached = totalsMap.get(row.account_id);
    if (cached !== undefined) return cached;

    let total: number;
    if (!row.is_summary) {
      total = pick(row);
    } else {
      const children = childrenOf.get(row.account_id) ?? [];
      total = children.length > 0 ? children.reduce((sum, c) => sum + effectiveTotal(c), 0) : 0;
    }
    totalsMap.set(row.account_id, total);
    return total;
  }

  // Pré-preenche totalizadoras com filhos + folhas.
  for (const r of sorted) {
    if (r.is_summary && (childrenOf.get(r.account_id) ?? []).length > 0) {
      effectiveTotal(r);
    } else if (!r.is_summary) {
      totalsMap.set(r.account_id, pick(r));
    }
  }

  // Passada de saldo corrente para as totalizadoras sem filhos.
  let running = 0;
  for (const r of sorted) {
    if (r.below_the_line) continue;
    if (r.parent_id !== null) continue;

    const childCount = (childrenOf.get(r.account_id) ?? []).length;
    const isStandalone = r.is_summary && childCount === 0;

    if (isStandalone) {
      totalsMap.set(r.account_id, running);
    } else {
      running += totalsMap.get(r.account_id) ?? 0;
    }
  }

  return totalsMap;
}

/**
 * Calcula os totais de exibição nos dois regimes: competência (`total` →
 * `effective_total`) e caixa (`total_cash` → `effective_total_cash`).
 */
export function computeDreTotals<T extends DreLinhaBase>(rows: T[]): ComTotaisEfetivos<T>[] {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const byId = new Map(sorted.map((r) => [r.account_id, r]));
  const childrenOf = new Map<string, T[]>();
  for (const r of sorted) {
    if (r.parent_id) {
      const list = childrenOf.get(r.parent_id) ?? [];
      list.push(r);
      childrenOf.set(r.parent_id, list);
    }
  }

  const accrualTotals = computeBasis(sorted, childrenOf, (r) => r.total);
  const cashTotals = computeBasis(sorted, childrenOf, (r) => r.total_cash);

  function depth(row: T): number {
    let d = 0;
    let cur: T | undefined = row;
    while (cur?.parent_id) {
      cur = byId.get(cur.parent_id);
      if (!cur) break;
      d += 1;
    }
    return d;
  }

  return sorted.map((r) => ({
    ...r,
    effective_total: accrualTotals.get(r.account_id) ?? 0,
    effective_total_cash: cashTotals.get(r.account_id) ?? 0,
    depth: depth(r),
  }));
}
