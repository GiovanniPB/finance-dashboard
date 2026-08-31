/**
 * Composição da despesa por conta — a mesma fonte do donut do dashboard.
 *
 * `search_transactions` no formato agregado responde algo parecido para uma empresa;
 * esta tool existe pelo que ela responde e a outra não: a composição **consolidada**
 * do grupo, numa chamada.
 *
 * Três armadilhas da RPC `expense_breakdown`, todas declaradas na proveniência:
 *
 * 1. **Ela EXCLUI a holding, sempre** — `c.is_holding = false` está no `where`,
 *    inclusive quando se passa `p_company_id`. Pedir a despesa da holding devolve
 *    vazio, e "vazio" seria lido como "a holding não tem despesa". Quando o
 *    resultado vem vazio e havia empresa, esta tool checa se era a holding e diz.
 * 2. **Não inclui lançamento pendente** (só `settled`/`reconciled`), ao contrário da
 *    DRE em competência.
 * 3. **O valor é bruto e positivo**, não com sinal: é magnitude de despesa, não
 *    linha de DRE.
 */
import { brl, toNumber } from "../format.ts";
import { asObject, optionalLimit, requireEscopo, requirePeriodo } from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";

export const TOP_PADRAO = 10;
export const TOP_MAX = 40;

interface DespesaRow {
  account_id: string | null;
  account_code: string | null;
  account_name: string;
  kind: string;
  total: string | number | null;
  is_other: boolean;
}

interface HoldingRow {
  is_holding: boolean;
}

export const expenseBreakdown: McpTool = {
  name: "expense_breakdown",
  title: "Composição da despesa por conta",
  description:
    "Maiores contas de DESPESA de um período, de uma empresa (company_id) ou do grupo consolidado " +
    "(organization_id), com o excedente agrupado em 'Outros'. Use para 'onde está indo o dinheiro', " +
    "'quais as maiores despesas', 'a despesa está concentrada?'. " +
    "Considera custos, despesas operacionais, de pessoal, financeiras e deduções de receita. " +
    "Valores BRUTOS e positivos (magnitude da despesa), não com sinal de DRE. " +
    "NÃO inclui lançamento pendente e NÃO cobre a holding. Para o detalhe dos lançamentos de uma conta, " +
    "use search_transactions.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description: "UUID da organização, para o consolidado do grupo. Alternativa a company_id.",
      },
      from: { type: "string", description: "Início do período, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período, AAAA-MM-DD." },
      top: {
        type: "number",
        description: `Quantas contas detalhar antes de agrupar o resto em 'Outros'. Padrão ${TOP_PADRAO}, teto ${TOP_MAX}.`,
      },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const { companyId, organizationId } = requireEscopo(p);
    const periodo = requirePeriodo(p);
    const top = optionalLimit(p, "top", TOP_PADRAO, TOP_MAX);

    const rows = await ds.rpc<DespesaRow>("expense_breakdown", {
      p_company_id: companyId ?? null,
      p_organization_id: organizationId ?? null,
      p_start: periodo.from,
      p_end: periodo.to,
      p_limit: top,
    });

    const contas = rows.map((r) => ({
      conta_codigo: r.account_code,
      conta: r.account_name,
      tipo_contabil: r.kind,
      total: toNumber(r.total),
      total_fmt: brl(r.total),
      agrupamento_outros: r.is_other,
    }));

    const total = contas.reduce((s, c) => Math.round((s + c.total) * 100) / 100, 0);
    const comPercentual = contas.map((c) => ({
      ...c,
      participacao_pct: total === 0 ? null : Math.round((c.total / total) * 1000) / 10,
    }));

    // Vazio com empresa informada tem duas causas muito diferentes — "não houve
    // despesa" e "é a holding, que a RPC exclui por construção". Distinguir custa
    // uma consulta e evita a conclusão errada.
    const avisos: string[] = [];
    if (rows.length === 0 && companyId) {
      const holdingRows = await ds.query<HoldingRow>({
        table: "companies",
        columns: "id,is_holding",
        filters: [{ column: "id", op: "eq", value: companyId }],
        limit: 1,
      });
      if (holdingRows[0]?.is_holding) {
        avisos.push(
          "Resultado vazio porque a empresa pedida é a HOLDING, e a RPC expense_breakdown exclui a holding " +
            "por construção. Não conclua que a holding não tem despesa: use get_dre ou search_transactions " +
            "para vê-la.",
        );
      }
    }

    return {
      dados: {
        contas: comPercentual,
        total,
        total_fmt: brl(total),
      },
      meta: proveniencia({
        fonte: "RPC expense_breakdown",
        escopo: companyId ? `empresa ${companyId}` : `grupo consolidado ${organizationId}`,
        periodo: periodo.rotulo,
        linhas: comPercentual.length,
        como_calculado:
          "Soma dos lançamentos de SAÍDA por conta, datados por accrual_date, com status settled e " +
          "reconciled, nas naturezas cogs, operating_expense, personnel_expense, financial_expense e " +
          `revenue_deduction. Valor bruto e positivo. As ${top} maiores contas aparecem detalhadas; ` +
          "o restante vem somado numa linha 'Outros' (agrupamento_outros = true). " +
          "A holding é excluída sempre, mesmo quando é a empresa pedida.",
        avisos: [
          "Não inclui lançamento com status pending; get_dre em competência inclui. Os dois números " +
            "divergem pelo valor pendente do período.",
          ...avisos,
        ],
      }),
    };
  },
};
