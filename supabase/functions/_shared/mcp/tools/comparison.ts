/**
 * Comparação de dois períodos da DRE, com variação por linha.
 *
 * Existe a RPC `dre_comparison`, e ela **não** é usada aqui de propósito: devolve
 * `total_a`/`total_b` sem `parent_id` nem `below_the_line`, que são justamente as
 * colunas de que `computeDreTotals` precisa para distinguir uma totalizadora que
 * soma filhos de uma que marca saldo corrente. Usá-la faria "(+) Venda Bruta" sair
 * errada — e as totalizadoras são o que alguém olha primeiro numa comparação.
 *
 * Duas chamadas a `dre_by_company` custam o mesmo (é o que a RPC faz por dentro),
 * garantem que cada lado da comparação seja idêntico ao que `get_dre` responderia
 * para aquele período, e de quebra habilitam o consolidado e o regime de caixa, que
 * a RPC não oferece.
 *
 * A variação percentual usa o MÓDULO do período B como base, e isso resolve um
 * problema concreto de leitura. Na DRE, saída é negativa. Uma despesa que vai de
 * -100 para -120 tem `variacao = -20`; com base assinada, o percentual sairia
 * **+20%** — sinal oposto ao da variação absoluta, na mesma linha. Com o módulo,
 * `variacao_pct = -20%`, e os dois campos sempre concordam no sinal.
 *
 * A convenção resultante é única e vale para a resposta inteira: **sinal positivo =
 * a linha melhorou o resultado** (receita subiu, ou despesa caiu); **negativo =
 * piorou**. É a mesma leitura da DRE, que é o ponto — a IA não precisa saber se
 * está olhando receita ou despesa para interpretar o sinal.
 */
import { carregarDre, valorNoRegime } from "../dre-fonte.ts";
import { brl } from "../format.ts";
import {
  asObject,
  brDate,
  McpParamError,
  optionalBoolean,
  optionalEnum,
  REGIMES,
  requireDate,
  requireEscopo,
} from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, Regime, ToolResponse } from "../types.ts";

/**
 * Variação relativa, com base no MÓDULO do período de comparação.
 *
 * O módulo garante que o sinal do percentual acompanhe o da variação absoluta —
 * com base assinada, uma despesa de -100 para -120 daria variação -20 e percentual
 * +20%, dois sinais contraditórios na mesma linha.
 */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

interface Janela {
  from: string;
  to: string;
  rotulo: string;
}

function janela(p: Record<string, unknown>, prefixo: string): Janela {
  const from = requireDate(p, `${prefixo}_from`);
  const to = requireDate(p, `${prefixo}_to`);
  if (from > to) {
    throw new McpParamError(
      `Período inválido: "${prefixo}_from" (${from}) é posterior a "${prefixo}_to" (${to}).`,
    );
  }
  return { from, to, rotulo: `${brDate(from)} a ${brDate(to)}` };
}

export const comparePeriods: McpTool = {
  name: "compare_periods",
  title: "Comparar dois períodos da DRE",
  description:
    "Compara a DRE de dois períodos linha a linha, com variação absoluta e percentual. " +
    "Use para 'julho contra junho', 'este ano contra o ano passado', 'o que mais cresceu na despesa'. " +
    "Funciona para uma empresa (company_id) ou para o grupo (organization_id), nos dois regimes. " +
    "O período A é o ATUAL e o período B é a BASE de comparação: variação positiva significa que A é " +
    "maior que B. Para uma única DRE, use get_dre.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description: "UUID da organização, para o consolidado. Alternativa a company_id.",
      },
      periodo_a_from: { type: "string", description: "Início do período ATUAL, AAAA-MM-DD." },
      periodo_a_to: { type: "string", description: "Fim do período ATUAL, AAAA-MM-DD." },
      periodo_b_from: {
        type: "string",
        description: "Início do período de COMPARAÇÃO (a base), AAAA-MM-DD.",
      },
      periodo_b_to: { type: "string", description: "Fim do período de COMPARAÇÃO, AAAA-MM-DD." },
      regime: {
        type: "string",
        enum: ["competencia", "caixa"],
        description: "competencia (padrão) ou caixa.",
      },
      apenas_com_variacao: {
        type: "boolean",
        description:
          "Padrão: true. Omite as linhas iguais nos dois períodos (as totalizadoras sempre aparecem).",
      },
    },
    required: ["periodo_a_from", "periodo_a_to", "periodo_b_from", "periodo_b_to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const escopo = requireEscopo(p);
    const a = janela(p, "periodo_a");
    const b = janela(p, "periodo_b");
    const regime = optionalEnum<Regime>(p, "regime", REGIMES, "competencia");
    const apenasComVariacao = optionalBoolean(p, "apenas_com_variacao", true);

    const [dreA, dreB] = await Promise.all([
      carregarDre(ds, escopo, a.from, a.to),
      carregarDre(ds, escopo, b.from, b.to),
    ]);

    // Indexa B por conta para o casamento. `account_id` é o mesmo dos dois lados
    // porque vem da mesma RPC e do mesmo plano de contas.
    const valoresB = new Map(dreB.linhas.map((r) => [r.account_id, valorNoRegime(r, regime)]));
    const vistosB = new Set<string>();

    const doA = dreA.linhas.map((r) => {
      vistosB.add(r.account_id);
      const valorA = valorNoRegime(r, regime);
      const valorB = valoresB.get(r.account_id) ?? 0;
      return {
        codigo: r.code,
        conta: r.name,
        secao: r.dre_section,
        totalizadora: r.is_summary,
        sort_order: r.sort_order,
        valor_a: valorA,
        valor_a_fmt: brl(valorA),
        valor_b: valorB,
        valor_b_fmt: brl(valorB),
        variacao: Math.round((valorA - valorB) * 100) / 100,
        variacao_fmt: brl(valorA - valorB),
        variacao_pct: variacaoPct(valorA, valorB),
      };
    });

    // Conta que existe só em B (foi zerada, ou desativada entre os períodos) some
    // do relatório se não for recuperada aqui — e "sumiu" é exatamente a variação
    // que mais interessa numa comparação.
    const soEmB = dreB.linhas
      .filter((r) => !vistosB.has(r.account_id) && valorNoRegime(r, regime) !== 0)
      .map((r) => {
        const valorB = valorNoRegime(r, regime);
        return {
          codigo: r.code,
          conta: r.name,
          secao: r.dre_section,
          totalizadora: r.is_summary,
          sort_order: r.sort_order,
          valor_a: 0,
          valor_a_fmt: brl(0),
          valor_b: valorB,
          valor_b_fmt: brl(valorB),
          variacao: Math.round(-valorB * 100) / 100,
          variacao_fmt: brl(-valorB),
          variacao_pct: variacaoPct(0, valorB),
        };
      });

    const todas = [...doA, ...soEmB].sort((x, y) => x.sort_order - y.sort_order);
    const linhas = todas
      .filter((l) => !apenasComVariacao || l.totalizadora || l.variacao !== 0)
      .map(({ sort_order: _ordem, ...resto }) => resto);

    // Maiores variações em valor absoluto, ignorando totalizadoras (que já são soma
    // das analíticas — apareceriam no topo e explicariam nada).
    const maioresVariacoes = todas
      .filter((l) => !l.totalizadora && l.variacao !== 0)
      .sort((x, y) => Math.abs(y.variacao) - Math.abs(x.variacao))
      .slice(0, 10)
      .map(({ sort_order: _ordem, ...resto }) => resto);

    return {
      dados: {
        periodo_a: a.rotulo,
        periodo_b: b.rotulo,
        linhas,
        resumo: linhas.filter((l) => l.totalizadora),
        maiores_variacoes: maioresVariacoes,
      },
      meta: proveniencia({
        fonte: `RPC ${dreA.fonte} (duas chamadas, uma por período)`,
        escopo: escopo.companyId
          ? `empresa ${escopo.companyId}`
          : `grupo consolidado ${escopo.organizationId}`,
        periodo: `A = ${a.rotulo}; B = ${b.rotulo}`,
        regime,
        linhas: linhas.length,
        como_calculado:
          "Cada período é a mesma DRE que get_dre responderia isoladamente, com as totalizadoras " +
          "derivadas da hierarquia. variacao = valor_a - valor_b. variacao_pct usa |valor_b| como base, " +
          "de modo que o sinal do percentual SEMPRE acompanha o da variação absoluta. " +
          "Convenção de sinal, válida para receita e despesa igualmente: POSITIVO = a linha melhorou o " +
          "resultado (receita subiu ou despesa caiu); NEGATIVO = piorou. " +
          "variacao_pct é null quando o período B é zero, porque não existe percentual sobre base zero. " +
          "'maiores_variacoes' exclui as linhas totalizadoras, que só repetem a soma das analíticas.",
        avisos:
          a.from > b.from
            ? []
            : [
                "O período A não é posterior ao período B. A leitura de 'variação' pressupõe A = atual e " +
                  "B = base de comparação; confirme se a ordem é a pretendida antes de concluir crescimento ou queda.",
              ],
      }),
    };
  },
};
