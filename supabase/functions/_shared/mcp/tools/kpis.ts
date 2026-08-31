/**
 * KPIs mês a mês: receita, margens, resultado e geração de caixa.
 *
 * Invólucro sobre `kpi_dashboard` / `kpi_dashboard_consolidated`, as RPCs que
 * alimentam o dashboard. Três divergências em relação a `get_dre` precisam viajar na
 * proveniência, porque as duas tools respondem "resultado do mês" e vão discordar:
 *
 * 1. **Aqui NÃO entra lançamento pendente.** As RPCs filtram
 *    `status in ('settled','reconciled')`; `get_dre` em competência inclui `pending`,
 *    porque em competência o fato ocorreu ainda que não pago. Enquanto não houver
 *    pendente no banco os números coincidem — e no dia em que houver, divergem
 *    exatamente por esse valor.
 * 2. **`geracao_de_caixa` é a única linha em regime de caixa.** Vem de `cash_date`,
 *    no meio de uma resposta datada por `accrual_date`. Somá-la às outras é somar
 *    dois regimes.
 * 3. **O consolidado exclui a holding**; o recorte por empresa, não. Pedir o
 *    consolidado e a holding separadamente e somar dá um número que não existe em
 *    lugar nenhum.
 *
 * Sinal: `deducoes`, `custos` e `despesas_fixas` saem POSITIVOS da RPC (já
 * invertidos), ao contrário da DRE, onde saída é negativa. Preservado como a RPC
 * entrega, para não criar um terceiro dialeto de sinal, e declarado na proveniência.
 */
import { brl, toNumber } from "../format.ts";
import { asObject, optionalBoolean, requireAno, requireEscopo } from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";

interface KpiRow {
  month_start: string;
  gross_revenue: string | number | null;
  revenue_deductions: string | number | null;
  net_revenue: string | number | null;
  cogs: string | number | null;
  contribution_margin: string | number | null;
  fixed_costs: string | number | null;
  financial_result: string | number | null;
  net_result: string | number | null;
  dividends: string | number | null;
  partner_bonus: string | number | null;
  partner_reimbursement: string | number | null;
  cash_generation: string | number | null;
  gross_margin_pct: string | number | null;
  net_margin_pct: string | number | null;
  effective_tax_rate_pct: string | number | null;
}

/** Campos que somam ao longo do ano. Percentuais ficam de fora: média de razão não é razão da média. */
const SOMAVEIS = [
  "receita_bruta",
  "deducoes",
  "receita_liquida",
  "custos",
  "margem_de_contribuicao",
  "despesas_fixas",
  "resultado_financeiro",
  "resultado_liquido",
  "dividendos",
  "bonus_de_socio",
  "reembolso_de_socio",
  "geracao_de_caixa",
] as const;

type Mensal = { mes: string } & Record<(typeof SOMAVEIS)[number], number> & {
    margem_bruta_pct: number | null;
    margem_liquida_pct: number | null;
    carga_tributaria_efetiva_pct: number | null;
  };

function pct(value: unknown): number | null {
  const n = toNumber(value);
  return n === 0 ? null : Math.round(n * 10) / 10;
}

export function mapearMes(r: KpiRow): Mensal {
  return {
    mes: r.month_start.slice(0, 7),
    receita_bruta: toNumber(r.gross_revenue),
    deducoes: toNumber(r.revenue_deductions),
    receita_liquida: toNumber(r.net_revenue),
    custos: toNumber(r.cogs),
    margem_de_contribuicao: toNumber(r.contribution_margin),
    despesas_fixas: toNumber(r.fixed_costs),
    resultado_financeiro: toNumber(r.financial_result),
    resultado_liquido: toNumber(r.net_result),
    dividendos: toNumber(r.dividends),
    bonus_de_socio: toNumber(r.partner_bonus),
    reembolso_de_socio: toNumber(r.partner_reimbursement),
    geracao_de_caixa: toNumber(r.cash_generation),
    margem_bruta_pct: pct(r.gross_margin_pct),
    margem_liquida_pct: pct(r.net_margin_pct),
    carga_tributaria_efetiva_pct: pct(r.effective_tax_rate_pct),
  };
}

/**
 * Total do ano.
 *
 * Os percentuais são RECALCULADOS sobre os totais, nunca a média dos percentuais
 * mensais — a média de doze margens é uma estatística sem significado contábil, e a
 * IA a citaria como "margem do ano".
 */
export function totalizarAno(meses: Mensal[]): Record<string, number | null> {
  const total: Record<string, number | null> = {};
  for (const campo of SOMAVEIS) {
    total[campo] = meses.reduce((s, m) => Math.round((s + m[campo]) * 100) / 100, 0);
  }
  const receitaBruta = total.receita_bruta ?? 0;
  const base = receitaBruta === 0 ? null : receitaBruta;
  total.margem_bruta_pct =
    base === null ? null : Math.round(((total.margem_de_contribuicao ?? 0) / base) * 1000) / 10;
  total.margem_liquida_pct =
    base === null ? null : Math.round(((total.resultado_liquido ?? 0) / base) * 1000) / 10;
  total.carga_tributaria_efetiva_pct =
    base === null ? null : Math.round(((total.deducoes ?? 0) / base) * 1000) / 10;
  return total;
}

export const getKpis: McpTool = {
  name: "get_kpis",
  title: "KPIs mensais (margens, resultado, geração de caixa)",
  description:
    "Indicadores mês a mês de um ANO CIVIL, de uma empresa (company_id) ou do grupo consolidado " +
    "(organization_id): receita bruta e líquida, deduções, custos, margem de contribuição, despesas fixas, " +
    "resultado financeiro, resultado líquido, geração de caixa e as margens percentuais. " +
    "Use para 'como foi o ano', 'a margem melhorou?', 'qual mês deu prejuízo', evolução mensal. " +
    "Trabalha por ano civil fechado (janeiro a dezembro) — para um período livre use get_dre, e para " +
    "comparar dois períodos use compare_periods. " +
    "ATENÇÃO: não inclui lançamento pendente, ao contrário da DRE em competência.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description:
          "UUID da organização, para o consolidado do grupo (que EXCLUI a holding). Alternativa a company_id.",
      },
      ano: { type: "number", description: "Ano civil de quatro dígitos, ex.: 2026." },
      incluir_meses_vazios: {
        type: "boolean",
        description: "Padrão: false. true devolve os 12 meses, inclusive os sem movimento.",
      },
    },
    required: ["ano"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const { companyId, organizationId } = requireEscopo(p);
    const ano = requireAno(p);
    const incluirVazios = optionalBoolean(p, "incluir_meses_vazios", false);

    const fonte = companyId ? "kpi_dashboard" : "kpi_dashboard_consolidated";
    const rows = await ds.rpc<KpiRow>(fonte, {
      ...(companyId ? { p_company_id: companyId } : { p_organization_id: organizationId }),
      p_year: ano,
    });

    const todos = rows.map(mapearMes);
    const meses = incluirVazios
      ? todos
      : todos.filter((m) => SOMAVEIS.some((campo) => m[campo] !== 0));

    // O total do ano soma os DOZE meses, não só os exibidos: filtrar mês vazio é
    // economia de contexto, e um mês zerado não muda a soma de qualquer forma.
    const total = totalizarAno(todos);

    return {
      dados: {
        ano,
        meses: meses.map((m) => ({
          ...m,
          resultado_liquido_fmt: brl(m.resultado_liquido),
          geracao_de_caixa_fmt: brl(m.geracao_de_caixa),
        })),
        total_do_ano: {
          ...total,
          resultado_liquido_fmt: brl(total.resultado_liquido ?? 0),
          geracao_de_caixa_fmt: brl(total.geracao_de_caixa ?? 0),
        },
      },
      meta: proveniencia({
        fonte: `RPC ${fonte}`,
        escopo: companyId ? `empresa ${companyId}` : `grupo consolidado ${organizationId}`,
        periodo: `ano civil ${ano}`,
        linhas: meses.length,
        como_calculado:
          "Soma dos lançamentos por natureza da conta (account_kind), datada por accrual_date, " +
          "com status settled e reconciled. deducoes, custos e despesas_fixas vêm POSITIVOS (sinal já " +
          "invertido pela RPC), diferente da DRE, onde saída é negativa. " +
          "geracao_de_caixa é a ÚNICA linha em regime de caixa: vem de cash_date. " +
          "Percentuais do total do ano são recalculados sobre os totais, não a média dos meses. " +
          (companyId
            ? "Recorte por empresa: a holding entra normalmente se for ela a empresa pedida."
            : "Consolidado: EXCLUI a holding, para não contar duas vezes o resultado das controladas."),
        avisos: [
          "Esta tool NÃO inclui lançamento com status pending, enquanto get_dre em regime de competência " +
            "inclui. Se houver pendente no período, o resultado daqui e o da DRE divergem por esse valor — " +
            "informe a diferença em vez de escolher um dos dois.",
          "Não some geracao_de_caixa com as demais linhas: ela está em regime de caixa e as outras em " +
            "competência.",
        ],
      }),
    };
  },
};
