/**
 * DRE — por empresa ou consolidada do grupo, nos dois regimes.
 *
 * Invólucro fino sobre `dre_by_company` / `dre_consolidated`, que já resolvem a
 * parte difícil (hierarquia do plano de contas, linhas totalizadoras, quais status
 * entram em cada regime). O trabalho aqui é escolher a coluna certa — `total`
 * (competência) ou `total_cash` (caixa) — e nunca deixar o regime implícito na
 * resposta.
 */
import { brl, toNumber } from "../format.ts";
import { asObject, optionalEnum, REGIMES, requireEscopo, requirePeriodo } from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, Regime, ToolResponse } from "../types.ts";

interface DreRow {
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

export const getDre: McpTool = {
  name: "get_dre",
  title: "DRE (Demonstração do Resultado)",
  description:
    "Retorna a DRE de UMA empresa (company_id) ou do grupo consolidado (organization_id), num período, " +
    "em regime de competência (padrão) ou caixa. Traz as linhas do plano de contas com valor e as linhas " +
    "totalizadoras. Use para: receita, deduções, custos, despesas, margem e resultado. " +
    "NÃO use para saldo bancário nem para previsão futura.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description:
          "UUID da organização, para a DRE consolidada do grupo. Alternativa a company_id.",
      },
      from: { type: "string", description: "Início do período, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período, AAAA-MM-DD." },
      regime: {
        type: "string",
        enum: ["competencia", "caixa"],
        description:
          "competencia (padrão, datado por accrual_date, inclui pendentes) ou caixa (cash_date, só liquidado).",
      },
      incluir_zerados: {
        type: "boolean",
        description: "Inclui contas com valor zero no período. Padrão: false (economiza contexto).",
      },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const { companyId, organizationId } = requireEscopo(p);
    const periodo = requirePeriodo(p);
    const regime = optionalEnum<Regime>(p, "regime", REGIMES, "competencia");
    const incluirZerados = p.incluir_zerados === true;

    const fonte = companyId ? "dre_by_company" : "dre_consolidated";
    const rows = await ds.rpc<DreRow>(fonte, {
      ...(companyId ? { p_company_id: companyId } : { p_organization_id: organizationId }),
      p_start: periodo.from,
      p_end: periodo.to,
    });

    const valorDe = (r: DreRow) => toNumber(regime === "caixa" ? r.total_cash : r.total);

    const linhas = rows
      .filter((r) => incluirZerados || r.is_summary || valorDe(r) !== 0)
      .map((r) => ({
        codigo: r.code,
        conta: r.name,
        secao: r.dre_section,
        totalizadora: r.is_summary,
        abaixo_da_linha: r.below_the_line,
        valor: valorDe(r),
        valor_fmt: brl(valorDe(r)),
      }));

    const resumo = linhas.filter((l) => l.totalizadora);

    return {
      dados: { linhas, resumo },
      meta: proveniencia({
        fonte: `RPC ${fonte}`,
        escopo: companyId ? `empresa ${companyId}` : `grupo consolidado ${organizationId}`,
        periodo: periodo.rotulo,
        regime,
        linhas: linhas.length,
        como_calculado:
          `Soma dos lançamentos por conta do plano de contas, com sinal (entrada positiva, saída negativa), ` +
          `usando a coluna ${regime === "caixa" ? "total_cash" : "total"} da RPC. ` +
          (incluirZerados
            ? "Inclui contas zeradas. "
            : "Contas zeradas omitidas (as totalizadoras sempre aparecem). "),
      }),
    };
  },
};
