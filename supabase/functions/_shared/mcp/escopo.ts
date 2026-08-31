/**
 * Resolução de escopo: de `company_id` / `organization_id` para uma lista de ids.
 *
 * Existe porque as fontes discordam sobre como recebem escopo. As RPCs de DRE têm
 * variante consolidada própria (`dre_consolidated`); a maioria das outras fontes —
 * `v_bills`, `bank_balances_multi`, `tax_obligations`, `invoice_jobs` — só conhece
 * `company_id`. Para essas, "o grupo consolidado" tem que virar a lista das
 * empresas da organização antes da consulta.
 *
 * A lista sai da tabela `companies`, **filtrada pela RLS**: se a pessoa só enxerga
 * duas das quatro empresas da organização, o consolidado que ela recebe é o das
 * duas. É a interpretação certa — melhor um consolidado parcial e declarado na
 * proveniência do que um erro de permissão no meio de uma análise.
 */
import { McpParamError } from "./params.ts";
import type { McpDataSource } from "./types.ts";

/** Teto de empresas por consulta. O grupo tem 4; o teto é folga, não expectativa. */
const MAX_EMPRESAS = 100;

export interface Escopo {
  /** Ids a usar no filtro. Uma para company_id, N para organization_id. */
  companyIds: string[];
  /** Rótulo pronto para a proveniência. */
  rotulo: string;
  /** true quando o pedido foi consolidado por organização. */
  consolidado: boolean;
  /** Avisos a repassar (ex.: consolidado parcial por permissão). */
  avisos: string[];
}

interface CompanyIdRow {
  id: string;
  organization_id: string;
}

/**
 * Converte o escopo pedido em ids de empresa.
 *
 * `company_id` não é verificado contra `companies` de propósito: se a pessoa não
 * tem acesso, a RLS da própria consulta seguinte devolve zero linhas, e uma
 * verificação a mais só custaria uma ida ao banco para chegar à mesma conclusão.
 */
export async function resolverEscopo(
  ds: McpDataSource,
  escopo: { companyId?: string; organizationId?: string },
): Promise<Escopo> {
  if (escopo.companyId) {
    return {
      companyIds: [escopo.companyId],
      rotulo: `empresa ${escopo.companyId}`,
      consolidado: false,
      avisos: [],
    };
  }

  const organizationId = escopo.organizationId;
  if (!organizationId) {
    throw new McpParamError(
      'Informe "company_id" ou "organization_id". Use a tool "list_companies" para descobrir os ids.',
    );
  }

  const rows = await ds.query<CompanyIdRow>({
    table: "companies",
    columns: "id,organization_id",
    filters: [
      { column: "organization_id", op: "eq", value: organizationId },
      { column: "is_active", op: "eq", value: true },
    ],
    order: { column: "sort_order", ascending: true },
    limit: MAX_EMPRESAS,
  });

  const companyIds = rows.map((r) => r.id);
  if (companyIds.length === 0) {
    throw new McpParamError(
      `Nenhuma empresa ativa visível na organização ${organizationId}. ` +
        'Confirme o id com "list_companies" — ausência aqui pode ser falta de permissão.',
    );
  }

  return {
    companyIds,
    rotulo: `grupo consolidado ${organizationId} (${companyIds.length} empresa(s))`,
    consolidado: true,
    avisos: [
      `Consolidado sobre as ${companyIds.length} empresa(s) ativas que você enxerga nesta organização. ` +
        "Empresa sem permissão de acesso não entra na soma e não gera erro — o total pode ser parcial.",
    ],
  };
}
