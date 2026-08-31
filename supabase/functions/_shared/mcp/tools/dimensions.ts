/**
 * As dimensões do financeiro: plano de contas, centros de custo, contrapartes,
 * contas bancárias e contas do pagar.me.
 *
 * Esta tool existe por um motivo específico: `search_transactions` sempre aceitou
 * `conta_codigo`, `cost_center_id` e `counterparty_id`, e **não havia como o modelo
 * descobrir esses valores** a não ser escrevendo SQL. Um filtro que só é alcançável
 * por SQL é, na prática, um filtro que não existe.
 *
 * Uma tool com `tipo` em vez de cinco tools: as cinco respostas são a mesma
 * pergunta ("quais são os valores possíveis desta dimensão?"), o esquema de
 * parâmetros é o mesmo, e cinco entradas quase idênticas no catálogo pioram a
 * escolha do modelo em vez de melhorá-la.
 */
import { maskDocument } from "../format.ts";
import {
  asObject,
  McpParamError,
  optionalBoolean,
  optionalLimit,
  optionalString,
  optionalUuid,
  requireEnum,
} from "../params.ts";
import { avisoTruncamento, proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, QueryFilter, ToolResponse } from "../types.ts";

export type Dimensao =
  | "contas"
  | "centros_de_custo"
  | "contrapartes"
  | "contas_bancarias"
  | "contas_pagarme";

export const DIMENSOES: readonly Dimensao[] = [
  "contas",
  "centros_de_custo",
  "contrapartes",
  "contas_bancarias",
  "contas_pagarme",
] as const;

export const LIMITE_PADRAO = 200;
export const LIMITE_MAX = 500;

/**
 * Qual escopo cada dimensão aceita.
 *
 * `contrapartes` é a exceção que obriga esta tabela a existir: cliente e
 * fornecedor pertencem à **organização**, não à empresa (`counterparties.
 * organization_id`), porque o mesmo fornecedor atende várias empresas do grupo.
 */
const ESCOPO_POR_DIMENSAO: Record<Dimensao, "empresa" | "organizacao"> = {
  contas: "empresa",
  centros_de_custo: "empresa",
  contrapartes: "organizacao",
  contas_bancarias: "empresa",
  contas_pagarme: "empresa",
};

interface ContaRow {
  code: string;
  name: string;
  kind: string;
  dre_section: string | null;
  is_summary: boolean;
  below_the_line: boolean;
  is_active: boolean;
}

interface CentroRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface ContraparteRow {
  id: string;
  name: string;
  kind: string | null;
  document: string | null;
  is_active: boolean;
}

interface BancoRow {
  id: string;
  bank_name: string;
  nickname: string;
  account_type: string;
  is_active: boolean;
}

interface PagarmeContaRow {
  pagarme_account_id: string;
  account_label: string;
  gateway_nickname: string | null;
  payout_nickname: string | null;
  cutover_date: string | null;
  enabled: boolean;
}

interface CompanyOrgRow {
  organization_id: string;
}

/** Descobre a organização de uma empresa, para as dimensões de escopo organizacional. */
async function organizacaoDa(ds: McpDataSource, companyId: string): Promise<string> {
  const rows = await ds.query<CompanyOrgRow>({
    table: "companies",
    columns: "id,organization_id",
    filters: [{ column: "id", op: "eq", value: companyId }],
    limit: 1,
  });
  const organizationId = rows[0]?.organization_id;
  if (!organizationId) {
    throw new McpParamError(
      `Empresa ${companyId} não encontrada ou sem permissão de acesso. Confirme com "list_companies".`,
    );
  }
  return organizationId;
}

export const listDimensions: McpTool = {
  name: "list_dimensions",
  title: "Dimensões (contas, centros de custo, contrapartes, bancos)",
  description:
    "Lista os valores possíveis de uma dimensão do financeiro, para você usar como FILTRO nas outras tools. " +
    "tipo=contas devolve o plano de contas com o código que search_transactions aceita em conta_codigo; " +
    "centros_de_custo e contrapartes devolvem os UUIDs que ela aceita em cost_center_id e counterparty_id; " +
    "contas_bancarias devolve o bank_account_id que get_account_ledger exige; " +
    "contas_pagarme devolve o pagarme_account_id que get_sales aceita. " +
    "Chame esta tool ANTES de tentar filtrar por conta, centro de custo, contraparte ou banco. " +
    "Não retorna nenhum valor financeiro — é cadastro, não saldo.",
  inputSchema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: [...DIMENSOES],
        description:
          "Qual dimensão listar. contas | centros_de_custo | contrapartes | contas_bancarias | contas_pagarme.",
      },
      company_id: {
        type: "string",
        description:
          "UUID da empresa. Obrigatório para contas, centros_de_custo, contas_bancarias e contas_pagarme. " +
          "Para contrapartes, serve para descobrir a organização.",
      },
      organization_id: {
        type: "string",
        description: "UUID da organização. Alternativa a company_id apenas para tipo=contrapartes.",
      },
      busca: {
        type: "string",
        description: "Trecho do nome, para filtrar (busca parcial, ignora maiúsculas).",
      },
      apenas_ativos: {
        type: "boolean",
        description: "Padrão: true. false inclui os registros desativados.",
      },
      limite: {
        type: "number",
        description: `Máximo de linhas. Padrão ${LIMITE_PADRAO}, teto ${LIMITE_MAX}.`,
      },
    },
    required: ["tipo"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const tipo = requireEnum<Dimensao>(p, "tipo", DIMENSOES);
    const companyId = optionalUuid(p, "company_id");
    const organizationId = optionalUuid(p, "organization_id");
    const busca = optionalString(p, "busca");
    const apenasAtivos = optionalBoolean(p, "apenas_ativos", true);
    const limite = optionalLimit(p, "limite", LIMITE_PADRAO, LIMITE_MAX);

    const precisa = ESCOPO_POR_DIMENSAO[tipo];
    if (precisa === "empresa" && !companyId) {
      throw new McpParamError(
        `Para tipo="${tipo}" o parâmetro "company_id" é obrigatório. Use a tool "list_companies".`,
      );
    }
    if (precisa === "organizacao" && !companyId && !organizationId) {
      throw new McpParamError(
        `Para tipo="${tipo}" informe "organization_id" (ou "company_id", que a organização é deduzida dele). ` +
          'Use a tool "list_companies".',
      );
    }

    const filtroAtivo = (coluna: string): QueryFilter[] =>
      apenasAtivos ? [{ column: coluna, op: "eq", value: true }] : [];
    const filtroBusca = (coluna: string): QueryFilter[] =>
      busca ? [{ column: coluna, op: "ilike", value: `%${busca}%` }] : [];

    if (tipo === "contas") {
      const rows = await ds.query<ContaRow>({
        table: "chart_of_accounts",
        columns: "code,name,kind,dre_section,is_summary,below_the_line,is_active",
        filters: [
          { column: "company_id", op: "eq", value: companyId },
          ...filtroAtivo("is_active"),
          ...filtroBusca("name"),
        ],
        order: { column: "sort_order", ascending: true },
        limit: limite,
      });
      return {
        dados: {
          contas: rows.map((r) => ({
            codigo: r.code,
            conta: r.name,
            tipo_contabil: r.kind,
            secao_dre: r.dre_section,
            totalizadora: r.is_summary,
            abaixo_da_linha: r.below_the_line,
            ativa: r.is_active,
          })),
        },
        meta: proveniencia({
          fonte: "tabela chart_of_accounts",
          escopo: `empresa ${companyId}`,
          linhas: rows.length,
          como_calculado:
            "Plano de contas da empresa, na ordem de exibição da DRE. O campo 'codigo' é o valor aceito em " +
            "search_transactions.conta_codigo. Conta 'totalizadora' já é soma de outras linhas — nunca some " +
            "junto com as analíticas.",
          avisos: avisoTruncamento(rows.length, limite),
        }),
      };
    }

    if (tipo === "centros_de_custo") {
      const rows = await ds.query<CentroRow>({
        table: "cost_centers",
        columns: "id,name,description,is_active",
        filters: [
          { column: "company_id", op: "eq", value: companyId },
          ...filtroAtivo("is_active"),
          ...filtroBusca("name"),
        ],
        order: { column: "name", ascending: true },
        limit: limite,
      });
      return {
        dados: {
          centros_de_custo: rows.map((r) => ({
            cost_center_id: r.id,
            nome: r.name,
            descricao: r.description,
            ativo: r.is_active,
          })),
        },
        meta: proveniencia({
          fonte: "tabela cost_centers",
          escopo: `empresa ${companyId}`,
          linhas: rows.length,
          como_calculado:
            "Centros de custo da empresa. 'cost_center_id' é o valor aceito em search_transactions.cost_center_id. " +
            "Lançamento sem centro de custo existe e aparece como 'Sem centro de custo' em cost_center_analysis.",
          avisos: avisoTruncamento(rows.length, limite),
        }),
      };
    }

    if (tipo === "contrapartes") {
      const orgId = organizationId ?? (await organizacaoDa(ds, companyId as string));
      const rows = await ds.query<ContraparteRow>({
        table: "counterparties",
        columns: "id,name,kind,document,is_active",
        filters: [
          { column: "organization_id", op: "eq", value: orgId },
          ...filtroAtivo("is_active"),
          ...filtroBusca("name"),
        ],
        order: { column: "name", ascending: true },
        limit: limite,
      });
      return {
        dados: {
          contrapartes: rows.map((r) => ({
            counterparty_id: r.id,
            nome: r.name,
            tipo: r.kind,
            documento: maskDocument(r.document),
            ativa: r.is_active,
          })),
        },
        meta: proveniencia({
          fonte: "tabela counterparties",
          escopo: `organização ${orgId}`,
          linhas: rows.length,
          como_calculado:
            "Clientes e fornecedores da ORGANIZAÇÃO, não de uma empresa — a mesma contraparte atende várias " +
            "empresas do grupo. 'tipo' é um de customer, supplier, employee, partner, government, other. " +
            "CPF mascarado; CNPJ preservado.",
          avisos: avisoTruncamento(rows.length, limite),
        }),
      };
    }

    if (tipo === "contas_bancarias") {
      const rows = await ds.query<BancoRow>({
        table: "bank_accounts",
        columns: "id,bank_name,nickname,account_type,is_active",
        filters: [
          { column: "company_id", op: "eq", value: companyId },
          ...filtroAtivo("is_active"),
          ...filtroBusca("nickname"),
        ],
        order: { column: "sort_order", ascending: true },
        limit: limite,
      });
      return {
        dados: {
          contas_bancarias: rows.map((r) => ({
            bank_account_id: r.id,
            banco: r.bank_name,
            apelido: r.nickname,
            tipo: r.account_type,
            ativa: r.is_active,
          })),
        },
        meta: proveniencia({
          fonte: "tabela bank_accounts",
          escopo: `empresa ${companyId}`,
          linhas: rows.length,
          como_calculado:
            "Contas bancárias da empresa. 'bank_account_id' é o valor exigido por get_account_ledger. " +
            "'tipo' inclui payment_gateway (a conta espelho do pagar.me), que não é banco no sentido usual.",
          avisos: avisoTruncamento(rows.length, limite),
        }),
      };
    }

    // contas_pagarme — vem de RPC, não de tabela: a ligação empresa ↔ conta do
    // gateway vive em pagarme_ledger_settings, e a RPC já resolve os dois lados.
    const rows = await ds.rpc<PagarmeContaRow>("pagarme_gateway_accounts", {
      p_company_id: companyId,
    });
    return {
      dados: {
        contas_pagarme: rows.map((r) => ({
          pagarme_account_id: r.pagarme_account_id,
          conta: r.account_label,
          conta_gateway: r.gateway_nickname,
          conta_repasse: r.payout_nickname,
          data_de_corte: r.cutover_date,
          projecao_no_ledger_ativa: r.enabled,
        })),
      },
      meta: proveniencia({
        fonte: "RPC pagarme_gateway_accounts",
        escopo: `empresa ${companyId}`,
        linhas: rows.length,
        como_calculado:
          "Contas do pagar.me ligadas à empresa. 'pagarme_account_id' é o valor aceito em get_sales. " +
          "'data_de_corte' é o início da série confiável de vendas: antes dela o ledger não tem dado. " +
          "'projecao_no_ledger_ativa' diz se as vendas viram lançamento projetado no financeiro.",
        avisos: avisoTruncamento(rows.length, limite),
      }),
    };
  },
};
