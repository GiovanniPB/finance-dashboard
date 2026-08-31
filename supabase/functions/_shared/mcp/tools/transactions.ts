/**
 * Busca de lançamentos — a tool de investigação.
 *
 * Três decisões semânticas aqui não são configuração, são proteção contra número
 * errado:
 *
 * 1. **Transferência fica de fora por padrão** (`transfer_group_id is null`). Mover
 *    dinheiro entre contas da mesma empresa não é receita nem despesa; incluir por
 *    acidente infla os dois lados.
 * 2. **O status segue o campo de data.** Competência inclui pendente; caixa não.
 *    Não existe combinação "por cash_date incluindo pendente" — seria caixa que não
 *    aconteceu.
 * 3. **Agregado é o padrão.** Devolver 500 linhas para o modelo somar é caro e
 *    convida ao erro de aritmética. Some no lugar certo e devolva o total.
 *
 * Limitação conhecida da Fase 1: o agregado é calculado aqui, sobre no máximo
 * AGREGADO_MAX linhas. Na Fase 2 isso vira agregação no banco, via schema `mcp_api`.
 */
import { brl, maskDocument, toNumber, truncate } from "../format.ts";
import {
  asObject,
  CAMPOS_DATA,
  optionalBoolean,
  optionalEnum,
  optionalLimit,
  optionalString,
  requirePeriodo,
  requireUuid,
} from "../params.ts";
import { avisoTruncamento, proveniencia, STATUS_POR_REGIME } from "../provenance.ts";
import type { CampoData, McpDataSource, McpTool, QueryFilter, ToolResponse } from "../types.ts";

/** Teto de linhas lidas para montar um agregado. */
export const AGREGADO_MAX = 2000;
/** Teto de linhas devolvidas em formato detalhado. */
export const LINHAS_MAX = 200;

type Formato = "agregado" | "linhas";
const FORMATOS: readonly Formato[] = ["agregado", "linhas"] as const;
type Direcao = "entrada" | "saida" | "ambas";
const DIRECOES: readonly Direcao[] = ["entrada", "saida", "ambas"] as const;

interface TxRow {
  id: string;
  accrual_date: string;
  cash_date: string | null;
  amount: string | number;
  direction: "inflow" | "outflow";
  status: string;
  description: string;
  document_ref: string | null;
  transfer_group_id: string | null;
  chart_of_accounts: { code: string; name: string; kind: string } | null;
  cost_centers: { name: string } | null;
  counterparties: { name: string; document: string | null } | null;
}

const COLUNAS =
  "id,accrual_date,cash_date,amount,direction,status,description,document_ref,transfer_group_id," +
  "chart_of_accounts(code,name,kind),cost_centers(name),counterparties(name,document)";

/** Valor com sinal: entrada positiva, saída negativa. */
export function valorComSinal(row: Pick<TxRow, "amount" | "direction">): number {
  const v = toNumber(row.amount);
  return row.direction === "inflow" ? v : -v;
}

export interface GrupoAgregado {
  conta_codigo: string;
  conta: string;
  lancamentos: number;
  entradas: number;
  saidas: number;
  liquido: number;
}

/** Agrupa por conta contábil, somando com sinal. */
export function agregarPorConta(rows: TxRow[]): GrupoAgregado[] {
  const acc = new Map<string, GrupoAgregado>();
  for (const row of rows) {
    const codigo = row.chart_of_accounts?.code ?? "(sem conta)";
    const nome = row.chart_of_accounts?.name ?? "(sem conta)";
    const atual = acc.get(codigo) ?? {
      conta_codigo: codigo,
      conta: nome,
      lancamentos: 0,
      entradas: 0,
      saidas: 0,
      liquido: 0,
    };
    const valor = toNumber(row.amount);
    const entrada = row.direction === "inflow";
    acc.set(codigo, {
      ...atual,
      lancamentos: atual.lancamentos + 1,
      entradas: Math.round((atual.entradas + (entrada ? valor : 0)) * 100) / 100,
      saidas: Math.round((atual.saidas + (entrada ? 0 : valor)) * 100) / 100,
      liquido: Math.round((atual.liquido + (entrada ? valor : -valor)) * 100) / 100,
    });
  }
  return Array.from(acc.values()).sort((a, b) => Math.abs(b.liquido) - Math.abs(a.liquido));
}

export const searchTransactions: McpTool = {
  name: "search_transactions",
  title: "Buscar lançamentos",
  description:
    "Busca lançamentos de uma empresa num período, com filtros. Devolve AGREGADO por conta contábil " +
    "(padrão) ou as linhas detalhadas. Use para investigar uma variação vista na DRE ou no caixa: " +
    "'o que puxou a despesa de julho', 'quais lançamentos deste fornecedor'. " +
    "Transferências entre contas são EXCLUÍDAS por padrão (não são receita nem despesa).",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      from: { type: "string", description: "Início do período, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período, AAAA-MM-DD." },
      campo_data: {
        type: "string",
        enum: ["competencia", "caixa"],
        description:
          "competencia (padrão) filtra por accrual_date e inclui pendentes; caixa filtra por cash_date e só traz liquidados.",
      },
      direcao: {
        type: "string",
        enum: ["entrada", "saida", "ambas"],
        description: "Padrão: ambas.",
      },
      texto: { type: "string", description: "Trecho da descrição do lançamento (busca parcial)." },
      conta_codigo: { type: "string", description: "Código da conta contábil, ex.: '3.1.01'." },
      cost_center_id: { type: "string", description: "UUID do centro de custo." },
      counterparty_id: { type: "string", description: "UUID do cliente/fornecedor." },
      valor_minimo: { type: "number", description: "Valor absoluto mínimo do lançamento." },
      incluir_transferencias: {
        type: "boolean",
        description: "Padrão: false. Transferência entre contas não é receita nem despesa.",
      },
      formato: {
        type: "string",
        enum: ["agregado", "linhas"],
        description: "agregado (padrão) soma por conta contábil; linhas devolve os lançamentos.",
      },
      limite: {
        type: "number",
        description: `Só no formato linhas. Padrão 50, máximo ${LINHAS_MAX}.`,
      },
    },
    required: ["company_id", "from", "to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const companyId = requireUuid(
      p,
      "company_id",
      'Use a tool "list_companies" para descobrir o id.',
    );
    const periodo = requirePeriodo(p);
    const campoData = optionalEnum<CampoData>(p, "campo_data", CAMPOS_DATA, "competencia");
    const direcao = optionalEnum<Direcao>(p, "direcao", DIRECOES, "ambas");
    const formato = optionalEnum<Formato>(p, "formato", FORMATOS, "agregado");
    const incluirTransferencias = optionalBoolean(p, "incluir_transferencias", false);
    const texto = optionalString(p, "texto");
    const contaCodigo = optionalString(p, "conta_codigo");
    const limite = optionalLimit(p, "limite", 50, LINHAS_MAX);

    const coluna = campoData === "caixa" ? "cash_date" : "accrual_date";
    const status = STATUS_POR_REGIME[campoData];

    const filters: QueryFilter[] = [
      { column: "company_id", op: "eq", value: companyId },
      { column: "deleted_at", op: "is", value: null },
      { column: coluna, op: "gte", value: periodo.from },
      { column: coluna, op: "lte", value: periodo.to },
      { column: "status", op: "in", value: status },
    ];
    if (!incluirTransferencias) {
      filters.push({ column: "transfer_group_id", op: "is", value: null });
    }
    if (direcao !== "ambas") {
      filters.push({
        column: "direction",
        op: "eq",
        value: direcao === "entrada" ? "inflow" : "outflow",
      });
    }
    if (texto) filters.push({ column: "description", op: "ilike", value: `%${texto}%` });
    if (contaCodigo)
      filters.push({ column: "chart_of_accounts.code", op: "eq", value: contaCodigo });
    const costCenterId = p.cost_center_id;
    if (typeof costCenterId === "string") {
      filters.push({ column: "cost_center_id", op: "eq", value: costCenterId });
    }
    const counterpartyId = p.counterparty_id;
    if (typeof counterpartyId === "string") {
      filters.push({ column: "counterparty_id", op: "eq", value: counterpartyId });
    }
    const valorMinimo = p.valor_minimo;
    if (typeof valorMinimo === "number") {
      filters.push({ column: "amount", op: "gte", value: valorMinimo });
    }

    const teto = formato === "agregado" ? AGREGADO_MAX : limite;
    const rows = await ds.query<TxRow>({
      table: "transactions",
      columns: COLUNAS,
      filters,
      order: { column: coluna, ascending: false },
      limit: teto,
    });

    const avisos = avisoTruncamento(rows.length, teto);
    const comoBase =
      `Lançamentos da empresa filtrados por ${coluna} no período, status ${status.join("/")}, ` +
      `excluindo apagados${incluirTransferencias ? "" : " e transferências entre contas"}. ` +
      "Valor com sinal: entrada positiva, saída negativa.";

    if (formato === "agregado") {
      const grupos = agregarPorConta(rows);
      const total = grupos.reduce((s, g) => Math.round((s + g.liquido) * 100) / 100, 0);
      return {
        dados: {
          por_conta: grupos.map((g) => ({ ...g, liquido_fmt: brl(g.liquido) })),
          total_liquido: total,
          total_liquido_fmt: brl(total),
          lancamentos: rows.length,
        },
        meta: proveniencia({
          fonte: "tabela transactions (agregado em memória)",
          escopo: `empresa ${companyId}`,
          periodo: periodo.rotulo,
          regime: campoData,
          linhas: grupos.length,
          como_calculado: `${comoBase} Somado por conta contábil.`,
          avisos,
        }),
      };
    }

    return {
      dados: {
        lancamentos: rows.map((r) => ({
          id: r.id,
          data_competencia: r.accrual_date,
          data_caixa: r.cash_date,
          valor: valorComSinal(r),
          valor_fmt: brl(valorComSinal(r)),
          status: r.status,
          descricao: truncate(r.description),
          documento: r.document_ref,
          conta_codigo: r.chart_of_accounts?.code ?? null,
          conta: r.chart_of_accounts?.name ?? null,
          centro_de_custo: r.cost_centers?.name ?? null,
          contraparte: r.counterparties?.name ?? null,
          contraparte_documento: maskDocument(r.counterparties?.document),
          transferencia: r.transfer_group_id !== null,
        })),
      },
      meta: proveniencia({
        fonte: "tabela transactions",
        escopo: `empresa ${companyId}`,
        periodo: periodo.rotulo,
        regime: campoData,
        linhas: rows.length,
        como_calculado: `${comoBase} CPF de contraparte mascarado; CNPJ preservado.`,
        avisos,
      }),
    };
  },
};
