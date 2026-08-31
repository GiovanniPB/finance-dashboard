/**
 * Panorama mensal — o pacote coerente numa chamada só.
 *
 * Existe contra tagarelice: "como foi julho na Assessoria?" respondido tool por tool
 * são oito chamadas, oito idas à rede, e o modelo somando à mão no fim. Cada soma
 * feita pelo modelo é uma chance de erro de aritmética que a proveniência não pega.
 *
 * Escopo é UMA empresa, de propósito. `cashflow_daily` e `forecast_cashflow_daily`
 * só aceitam uma empresa por chamada, e um briefing consolidado exigiria N chamadas
 * de cada, com a agregação de saldo e aging feita aqui — mais superfície para
 * divergir do dashboard do que o valor entregue. Para o consolidado, `get_dre` e
 * `get_kpis` aceitam `organization_id`.
 *
 * Cada bloco cita a tool que o aprofunda, para o modelo saber onde cavar em vez de
 * tentar deduzir do agregado.
 */
import { carregarDre, valorNoRegime } from "../dre-fonte.ts";
import { brl, toNumber } from "../format.ts";
import { asObject, optionalBoolean, requireMes, requireUuid } from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";
import { agregarFaixas } from "./bills.ts";

interface CashflowRow {
  day: string;
  inflow: string | number | null;
  outflow: string | number | null;
  net: string | number | null;
}

interface SaldoRow {
  bank_account_id: string;
  nickname: string;
  closing_balance: string | number | null;
}

interface AgingRow {
  company_id: string;
  direction: "inflow" | "outflow";
  bucket: string;
  count: number;
  total: string | number | null;
}

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Mês anterior a AAAA-MM. */
export function mesAnterior(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  const anoAnterior = m === 1 ? ano - 1 : ano;
  const mesAnteriorNum = m === 1 ? 12 : m - 1;
  return `${anoAnterior}-${String(mesAnteriorNum).padStart(2, "0")}`;
}

export const monthlyBriefing: McpTool = {
  name: "monthly_briefing",
  title: "Panorama do mês",
  description:
    "Panorama completo de UM MÊS de uma empresa, numa chamada: resultado da DRE (com comparação ao mês " +
    "anterior), fluxo de caixa realizado, saldo bancário no fim do mês, aging de contas a pagar e a " +
    "receber, e as maiores variações de conta. " +
    "Use quando a pergunta é ampla — 'como foi julho', 'me dá um resumo do mês', 'fechamento mensal' — " +
    "em vez de chamar get_dre, get_cashflow, get_bank_balances e get_aging separadamente. " +
    "Escopo é uma empresa só; para o grupo consolidado use get_dre ou get_kpis com organization_id. " +
    "Cada bloco indica a tool que o aprofunda.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      mes: { type: "string", description: "Mês de referência, AAAA-MM (ex.: 2026-07)." },
      comparar_com_mes_anterior: {
        type: "boolean",
        description: "Padrão: true. Acrescenta o resultado do mês anterior e a variação.",
      },
    },
    required: ["company_id", "mes"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const companyId = requireUuid(
      p,
      "company_id",
      'Use a tool "list_companies" para descobrir o id.',
    );
    const mes = requireMes(p);
    const comparar = optionalBoolean(p, "comparar_com_mes_anterior", true);
    const escopo = { companyId };

    const anterior = requireMes({ mes: mesAnterior(mes.mes) });

    const [dreAtual, dreAnterior, cashflowRows, saldoRows, agingRows] = await Promise.all([
      carregarDre(ds, escopo, mes.from, mes.to),
      comparar ? carregarDre(ds, escopo, anterior.from, anterior.to) : Promise.resolve(null),
      ds.rpc<CashflowRow>("cashflow_daily", {
        p_company_id: companyId,
        p_start: mes.from,
        p_end: mes.to,
      }),
      // Saldo no ÚLTIMO dia do mês, não hoje: o briefing é do mês pedido, e um mês
      // fechado com o saldo de hoje é a mistura mais fácil de fazer aqui.
      ds.rpc<SaldoRow>("bank_balances_multi", {
        p_as_of: mes.to,
        p_company_ids: [companyId],
      }),
      ds.query<AgingRow>({
        table: "v_bills_aging",
        columns: "company_id,direction,bucket,count,total",
        filters: [{ column: "company_id", op: "eq", value: companyId }],
        order: { column: "bucket", ascending: true },
        limit: 100,
      }),
    ]);

    // --- DRE: só as linhas totalizadoras, que é o que um panorama pede.
    const resumoDre = dreAtual.linhas
      .filter((r) => r.is_summary)
      .map((r) => {
        const valor = valorNoRegime(r, "competencia");
        return { codigo: r.code, conta: r.name, valor, valor_fmt: brl(valor) };
      });

    const anterioresPorConta = new Map(
      (dreAnterior?.linhas ?? []).map((r) => [r.account_id, valorNoRegime(r, "competencia")]),
    );

    const maioresVariacoes = comparar
      ? dreAtual.linhas
          .filter((r) => !r.is_summary)
          .map((r) => {
            const atual = valorNoRegime(r, "competencia");
            const antes = anterioresPorConta.get(r.account_id) ?? 0;
            return {
              codigo: r.code,
              conta: r.name,
              valor_mes: atual,
              valor_mes_anterior: antes,
              variacao: arred(atual - antes),
              variacao_fmt: brl(atual - antes),
            };
          })
          .filter((l) => l.variacao !== 0)
          .sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))
          .slice(0, 8)
      : [];

    const resultadoAtual = dreAtual.linhas
      .filter((r) => !r.is_summary && !r.below_the_line)
      .reduce((s, r) => arred(s + valorNoRegime(r, "competencia")), 0);
    const resultadoAnterior = (dreAnterior?.linhas ?? [])
      .filter((r) => !r.is_summary && !r.below_the_line)
      .reduce((s, r) => arred(s + valorNoRegime(r, "competencia")), 0);

    // --- Fluxo de caixa realizado do mês.
    const caixa = cashflowRows.reduce(
      (acc, r) => ({
        entradas: arred(acc.entradas + toNumber(r.inflow)),
        saidas: arred(acc.saidas + toNumber(r.outflow)),
        liquido: arred(acc.liquido + toNumber(r.net)),
      }),
      { entradas: 0, saidas: 0, liquido: 0 },
    );

    // --- Saldo bancário no fim do mês.
    const saldoTotal = saldoRows.reduce((s, r) => arred(s + toNumber(r.closing_balance)), 0);

    // --- Aging, nas duas direções.
    const aging = (d: "inflow" | "outflow") => {
      const faixas = agregarFaixas(agingRows.filter((r) => r.direction === d));
      const total = faixas.reduce((s, f) => arred(s + f.total), 0);
      const vencido = faixas.filter((f) => f.vencido).reduce((s, f) => arred(s + f.total), 0);
      return {
        total,
        total_fmt: brl(total),
        vencido,
        vencido_fmt: brl(vencido),
        a_vencer: arred(total - vencido),
      };
    };

    return {
      dados: {
        empresa: companyId,
        mes: mes.mes,
        resultado: {
          resumo_dre: resumoDre,
          resultado_do_mes: resultadoAtual,
          resultado_do_mes_fmt: brl(resultadoAtual),
          ...(comparar
            ? {
                resultado_mes_anterior: resultadoAnterior,
                resultado_mes_anterior_fmt: brl(resultadoAnterior),
                variacao: arred(resultadoAtual - resultadoAnterior),
                variacao_fmt: brl(resultadoAtual - resultadoAnterior),
                mes_anterior: anterior.mes,
              }
            : {}),
          aprofundar_com: "get_dre (ou compare_periods para a comparação linha a linha)",
        },
        caixa_realizado: {
          ...caixa,
          liquido_fmt: brl(caixa.liquido),
          aprofundar_com: "get_cashflow",
        },
        saldo_bancario_fim_do_mes: {
          total: saldoTotal,
          total_fmt: brl(saldoTotal),
          contas: saldoRows.map((r) => ({
            bank_account_id: r.bank_account_id,
            apelido: r.nickname,
            saldo: toNumber(r.closing_balance),
            saldo_fmt: brl(r.closing_balance),
          })),
          aprofundar_com: "get_bank_balances (ou get_account_ledger para o extrato)",
        },
        titulos_em_aberto: {
          a_receber: aging("inflow"),
          a_pagar: aging("outflow"),
          aprofundar_com: "get_aging e list_open_bills",
        },
        ...(comparar ? { maiores_variacoes_vs_mes_anterior: maioresVariacoes } : {}),
      },
      meta: proveniencia({
        fonte: `RPCs ${dreAtual.fonte} + cashflow_daily + bank_balances_multi, view v_bills_aging`,
        escopo: `empresa ${companyId}`,
        periodo: mes.rotulo,
        linhas: resumoDre.length,
        como_calculado:
          "O bloco 'resultado' é a DRE em COMPETÊNCIA (inclui pendentes), com as totalizadoras derivadas da " +
          "hierarquia — idêntico ao que get_dre responderia. 'resultado_do_mes' soma as contas analíticas " +
          "acima da linha. " +
          "'caixa_realizado' é regime de CAIXA (settled + reconciled, datado por cash_date): é outro regime, " +
          "não confira contra o resultado. " +
          "'saldo_bancario_fim_do_mes' é a posição no último dia do mês pedido, não a de hoje, e conta só " +
          "lançamento settled. " +
          "'titulos_em_aberto' é a posição ATUAL da carteira, não a do fim do mês — a view calcula atraso " +
          "contra a data de hoje.",
        avisos: [
          "Este panorama mistura três regimes por natureza: resultado em competência, caixa realizado em " +
            "caixa, e saldo bancário como posição. Não some blocos entre si.",
          "O aging é a foto de HOJE, mesmo quando o mês pedido é passado: as faixas de vencimento são " +
            "calculadas contra a data atual. Para um mês fechado, leia-o como situação corrente da carteira, " +
            "não como fotografia daquele mês.",
        ],
      }),
    };
  },
};
