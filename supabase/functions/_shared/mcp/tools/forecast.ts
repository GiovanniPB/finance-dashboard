/**
 * Previsão de caixa — o futuro, que nenhuma outra tool responde.
 *
 * `get_cashflow` e `get_dre` já mandavam o modelo para cá ("para o futuro, use
 * forecast") e a tool não existia: era uma referência pendurada, e o modelo caía no
 * `sql_query` ou respondia que não sabia.
 *
 * Duas somas erradas são fáceis aqui, e as duas estão barradas por construção:
 *
 * 1. **`pagarme` é SUBCONJUNTO das entradas esperadas, não parcela adicional.** Os
 *    títulos projetados dos recebíveis já estão em `entradas_esperadas`; somar as
 *    duas séries infla a previsão. A tela desenha a série do pagar.me *por cima* das
 *    entradas justamente por isso (`ForecastChart.tsx`). Aqui ela vem num campo
 *    separado e explicitamente marcada.
 * 2. **`recorrente` NÃO é subconjunto** — é o complemento. As ocorrências de
 *    recorrência já materializadas como lançamento `scheduled` entram em
 *    `entradas_esperadas`; a projeção a partir dos templates só preenche o horizonte
 *    ALÉM do que foi materializado (por isso costuma vir zerada nos primeiros meses).
 *    O total é esperado + recorrente, que é o que a RPC usa no próprio
 *    `running_balance` e o que a tela soma.
 *
 * O `saldo_projetado` também não bate necessariamente com `get_bank_balances` na
 * mesma data: a abertura da previsão soma o saldo inicial de TODAS as contas da
 * empresa, ativas ou não, e ignora `initial_balance_date`, que o saldo bancário
 * respeita. Está na proveniência.
 */
import { brl, toNumber } from "../format.ts";
import { asObject, optionalBoolean, optionalEnum, requirePeriodo, requireUuid } from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";

type Granularidade = "diario" | "mensal";
const GRANULARIDADES: readonly Granularidade[] = ["diario", "mensal"] as const;

interface ForecastRow {
  day: string;
  inflow_expected: string | number | null;
  outflow_expected: string | number | null;
  inflow_recurring: string | number | null;
  outflow_recurring: string | number | null;
  running_balance: string | number | null;
}

interface PagarmeRow {
  day: string;
  inflow_pagarme: string | number | null;
  fees_pagarme: string | number | null;
}

export interface PontoPrevisto {
  periodo: string;
  entradas_esperadas: number;
  saidas_esperadas: number;
  entradas_recorrentes: number;
  saidas_recorrentes: number;
  entradas_total: number;
  saidas_total: number;
  liquido: number;
  /** Só no diário: o saldo acumulado que a RPC calcula. No mensal, o do último dia. */
  saldo_projetado: number;
  /** Subconjunto de entradas_esperadas. Nunca somar. */
  entradas_pagarme: number;
}

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}

function pontoDe(r: ForecastRow, pagarme: number): PontoPrevisto {
  const entradasEsperadas = toNumber(r.inflow_expected);
  const saidasEsperadas = toNumber(r.outflow_expected);
  const entradasRecorrentes = toNumber(r.inflow_recurring);
  const saidasRecorrentes = toNumber(r.outflow_recurring);
  const entradasTotal = arred(entradasEsperadas + entradasRecorrentes);
  const saidasTotal = arred(saidasEsperadas + saidasRecorrentes);
  return {
    periodo: r.day,
    entradas_esperadas: entradasEsperadas,
    saidas_esperadas: saidasEsperadas,
    entradas_recorrentes: entradasRecorrentes,
    saidas_recorrentes: saidasRecorrentes,
    entradas_total: entradasTotal,
    saidas_total: saidasTotal,
    liquido: arred(entradasTotal - saidasTotal),
    saldo_projetado: toNumber(r.running_balance),
    entradas_pagarme: pagarme,
  };
}

/**
 * Agrega os dias em meses.
 *
 * `saldo_projetado` é o do ÚLTIMO dia do mês, não a soma — é saldo, não fluxo.
 * Somá-lo daria um número sem significado, e é o erro que a agregação ingênua comete.
 */
export function agregarPrevisaoPorMes(pontos: PontoPrevisto[]): PontoPrevisto[] {
  const acc = new Map<string, PontoPrevisto>();
  const ordenados = [...pontos].sort((a, b) => a.periodo.localeCompare(b.periodo));
  for (const p of ordenados) {
    const mes = p.periodo.slice(0, 7);
    const atual = acc.get(mes);
    acc.set(mes, {
      periodo: mes,
      entradas_esperadas: arred((atual?.entradas_esperadas ?? 0) + p.entradas_esperadas),
      saidas_esperadas: arred((atual?.saidas_esperadas ?? 0) + p.saidas_esperadas),
      entradas_recorrentes: arred((atual?.entradas_recorrentes ?? 0) + p.entradas_recorrentes),
      saidas_recorrentes: arred((atual?.saidas_recorrentes ?? 0) + p.saidas_recorrentes),
      entradas_total: arred((atual?.entradas_total ?? 0) + p.entradas_total),
      saidas_total: arred((atual?.saidas_total ?? 0) + p.saidas_total),
      liquido: arred((atual?.liquido ?? 0) + p.liquido),
      // Último dia do mês vence, porque a lista está em ordem cronológica.
      saldo_projetado: p.saldo_projetado,
      entradas_pagarme: arred((atual?.entradas_pagarme ?? 0) + p.entradas_pagarme),
    });
  }
  return Array.from(acc.values());
}

export const forecastCashflow: McpTool = {
  name: "forecast_cashflow",
  title: "Previsão de caixa",
  description:
    "Projeção de entradas, saídas e SALDO futuro de uma empresa, por dia ou por mês. " +
    "Use para 'vou ter caixa para pagar a folha', 'quando o saldo fica negativo', 'quanto entra em outubro'. " +
    "Composta por: títulos pendentes e agendados (entradas/saidas_esperadas) MAIS a projeção das " +
    "recorrências além do horizonte já materializado (entradas/saidas_recorrentes). O total é a soma das duas. " +
    "'entradas_pagarme' é um SUBCONJUNTO de entradas_esperadas, informado à parte — NUNCA some. " +
    "É previsão, não realizado: para o que já aconteceu use get_cashflow, e para o saldo de hoje " +
    "use get_bank_balances.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      from: { type: "string", description: "Início do horizonte, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do horizonte, AAAA-MM-DD." },
      granularidade: {
        type: "string",
        enum: ["diario", "mensal"],
        description: "Padrão: mensal. Use diario só para horizontes curtos.",
      },
      incluir_pagarme: {
        type: "boolean",
        description:
          "Padrão: true. Traz a fatia das entradas que vem dos recebíveis do pagar.me (subconjunto, não soma).",
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
    const granularidade = optionalEnum<Granularidade>(p, "granularidade", GRANULARIDADES, "mensal");
    const incluirPagarme = optionalBoolean(p, "incluir_pagarme", true);

    const [rows, pagarmeRows] = await Promise.all([
      ds.rpc<ForecastRow>("forecast_cashflow_daily", {
        p_company_id: companyId,
        p_from: periodo.from,
        p_to: periodo.to,
      }),
      incluirPagarme
        ? ds.rpc<PagarmeRow>("forecast_pagarme_inflow", {
            p_company_id: companyId,
            p_from: periodo.from,
            p_to: periodo.to,
          })
        : Promise.resolve([] as PagarmeRow[]),
    ]);

    const pagarmePorDia = new Map(
      pagarmeRows.map((r) => [r.day, toNumber(r.inflow_pagarme)] as const),
    );
    const diario = rows.map((r) => pontoDe(r, pagarmePorDia.get(r.day) ?? 0));
    const serie = granularidade === "mensal" ? agregarPrevisaoPorMes(diario) : diario;

    const totais = diario.reduce(
      (acc, pt) => ({
        entradas: arred(acc.entradas + pt.entradas_total),
        saidas: arred(acc.saidas + pt.saidas_total),
        liquido: arred(acc.liquido + pt.liquido),
        pagarme: arred(acc.pagarme + pt.entradas_pagarme),
      }),
      { entradas: 0, saidas: 0, liquido: 0, pagarme: 0 },
    );

    const saldoInicial =
      diario.length > 0 ? arred(diario[0].saldo_projetado - diario[0].liquido) : 0;
    const saldoFinal = diario.length > 0 ? diario[diario.length - 1].saldo_projetado : 0;
    const menorSaldo = diario.reduce<PontoPrevisto | null>(
      (min, pt) => (min === null || pt.saldo_projetado < min.saldo_projetado ? pt : min),
      null,
    );

    return {
      dados: {
        serie: serie.map((pt) => ({
          ...pt,
          liquido_fmt: brl(pt.liquido),
          saldo_projetado_fmt: brl(pt.saldo_projetado),
        })),
        totais: {
          entradas: totais.entradas,
          saidas: totais.saidas,
          liquido: totais.liquido,
          liquido_fmt: brl(totais.liquido),
          ...(incluirPagarme ? { entradas_pagarme_incluidas_nas_entradas: totais.pagarme } : {}),
        },
        saldo_inicial: saldoInicial,
        saldo_inicial_fmt: brl(saldoInicial),
        saldo_final_projetado: saldoFinal,
        saldo_final_projetado_fmt: brl(saldoFinal),
        menor_saldo: menorSaldo
          ? {
              data: menorSaldo.periodo,
              saldo: menorSaldo.saldo_projetado,
              saldo_fmt: brl(menorSaldo.saldo_projetado),
              negativo: menorSaldo.saldo_projetado < 0,
            }
          : null,
      },
      meta: proveniencia({
        fonte: incluirPagarme
          ? "RPCs forecast_cashflow_daily + forecast_pagarme_inflow"
          : "RPC forecast_cashflow_daily",
        escopo: `empresa ${companyId}`,
        periodo: periodo.rotulo,
        linhas: serie.length,
        como_calculado:
          "esperado = lançamentos pending e scheduled, pelo valor ainda em aberto (valor - pago), datados " +
          "por cash_date, ou vencimento, ou competência, na primeira que existir. " +
          "recorrente = projeção dos templates de recorrência ativos, que preenche só o horizonte além das " +
          "ocorrências já materializadas (por isso vem zerado nos meses já materializados). " +
          "total = esperado + recorrente, a mesma soma que a RPC usa no saldo acumulado e que a tela exibe. " +
          "saldo_projetado é o acumulado a partir da abertura; no corte mensal é o saldo do ÚLTIMO dia do " +
          "mês, não a soma dos dias.",
        avisos: [
          "É PREVISÃO, não realizado. Um lançamento agendado pode não acontecer, e a projeção de recorrência " +
            "supõe que os templates continuem ativos.",
          ...(incluirPagarme
            ? [
                "entradas_pagarme é um SUBCONJUNTO de entradas_esperadas (os títulos projetados dos " +
                  "recebíveis já estão lá). Nunca some as duas: infla a previsão.",
              ]
            : []),
          "O saldo de abertura desta previsão soma o saldo inicial de TODAS as contas da empresa e ignora " +
            "initial_balance_date, que get_bank_balances respeita. Os dois saldos podem não coincidir na " +
            "mesma data — para a posição de hoje, get_bank_balances é a fonte.",
        ],
      }),
    };
  },
};
