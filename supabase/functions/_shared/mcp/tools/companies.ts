/**
 * Tools de contexto: sem elas o modelo não tem como chamar nenhuma outra, porque
 * toda tool de número exige `company_id` ou `organization_id` explícito.
 */
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";

interface CompanyRow {
  id: string;
  organization_id: string;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  tax_regime: string;
  is_holding: boolean;
  is_active: boolean;
}

const LIMITE = 100;

export const listCompanies: McpTool = {
  name: "list_companies",
  title: "Empresas acessíveis",
  description:
    "Lista as empresas do grupo que VOCÊ tem permissão de ver, com o id de cada uma e o id da organização (para consolidado). " +
    "Chame esta tool ANTES de qualquer outra: todas exigem company_id ou organization_id explícito. " +
    "Não retorna nenhum valor financeiro.",
  inputSchema: {
    type: "object",
    properties: {
      incluir_inativas: {
        type: "boolean",
        description: "Inclui empresas desativadas. Padrão: false.",
      },
    },
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const incluirInativas =
      typeof params === "object" && params !== null
        ? (params as Record<string, unknown>).incluir_inativas === true
        : false;

    const rows = await ds.query<CompanyRow>({
      table: "companies",
      columns: "id,organization_id,legal_name,trade_name,cnpj,tax_regime,is_holding,is_active",
      filters: incluirInativas ? [] : [{ column: "is_active", op: "eq", value: true }],
      order: { column: "sort_order", ascending: true },
      limit: LIMITE,
    });

    const empresas = rows.map((r) => ({
      company_id: r.id,
      organization_id: r.organization_id,
      nome: r.trade_name ?? r.legal_name,
      razao_social: r.legal_name,
      cnpj: r.cnpj,
      regime_tributario: r.tax_regime,
      holding: r.is_holding,
      ativa: r.is_active,
    }));

    const orgs = Array.from(new Set(empresas.map((e) => e.organization_id)));

    return {
      dados: { empresas, organization_ids: orgs },
      meta: proveniencia({
        fonte: "tabela companies",
        escopo: "empresas visíveis para o usuário autenticado",
        linhas: empresas.length,
        como_calculado:
          "Lista filtrada pela RLS: só aparecem as empresas às quais o usuário tem acesso. " +
          "Se uma empresa esperada não está aqui, é falta de permissão, não ausência de dado.",
      }),
    };
  },
};
