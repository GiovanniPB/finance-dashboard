/**
 * Fluxo de caixa realizado.
 *
 * Sempre regime de CAIXA — é a definição do relatório, não uma opção. A RPC
 * `cashflow_monthly` só aceita um ano inteiro; para não amarrar o modelo a essa
 * limitação, o corte mensal é feito agregando o diário aqui. Uma chamada, qualquer
 * período.
 */
import { brl, toNumber } from "../format.ts";
import { asObject, optionalEnum, requirePeriodo, requireUuid } from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";

interface CashflowRow {
  day: string;
  inflow: string | number | null;
  outflow: string | number | null;
  net: string | number | null;
}

type Granularidade = "diario" | "mensal";
const GRANULARIDADES: readonly Granularidade[] = ["diario", "mensal"] as const;

interface Ponto {
  periodo: string;
  entradas: number;
  saidas: number;
  liquido: number;
}

/** AAAA-MM-DD -> AAAA-MM. */
export function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

/** Agrega pontos diários em meses, preservando a ordem cronológica. */
export function agregarPorMes(pontos: Ponto[]): Ponto[] {
  const acc = new Map<string, Ponto>();
  for (const p of pontos) {
    const mes = mesDe(p.periodo);
    const atual = acc.get(mes) ?? { periodo: mes, entradas: 0, saidas: 0, liquido: 0 };
    acc.set(mes, {
      periodo: mes,
      entradas: Math.round((atual.entradas + p.entradas) * 100) / 100,
      saidas: Math.round((atual.saidas + p.saidas) * 100) / 100,
      liquido: Math.round((atual.liquido + p.liquido) * 100) / 100,
    });
  }
  return Array.from(acc.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export const getCashflow: McpTool = {
  name: "get_cashflow",
  title: "Fluxo de caixa realizado",
  description:
    "Entradas, saídas e líquido REALIZADOS de uma empresa num período, por dia ou por mês. " +
    "Sempre regime de caixa (datado pela data de liquidação). " +
    "NÃO é previsão: lançamentos agendados e pendentes não entram. Para o futuro, use forecast. " +
    "NÃO é saldo bancário: é movimento do período.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      from: { type: "string", description: "Início do período, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período, AAAA-MM-DD." },
      granularidade: {
        type: "string",
        enum: ["diario", "mensal"],
        description: "Padrão: mensal. Use diario só para períodos curtos.",
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

    const rows = await ds.rpc<CashflowRow>("cashflow_daily", {
      p_company_id: companyId,
      p_start: periodo.from,
      p_end: periodo.to,
    });

    const diario: Ponto[] = rows.map((r) => ({
      periodo: r.day,
      entradas: toNumber(r.inflow),
      saidas: toNumber(r.outflow),
      liquido: toNumber(r.net),
    }));

    const serie = granularidade === "mensal" ? agregarPorMes(diario) : diario;

    const totais = serie.reduce(
      (acc, pt) => ({
        entradas: Math.round((acc.entradas + pt.entradas) * 100) / 100,
        saidas: Math.round((acc.saidas + pt.saidas) * 100) / 100,
        liquido: Math.round((acc.liquido + pt.liquido) * 100) / 100,
      }),
      { entradas: 0, saidas: 0, liquido: 0 },
    );

    return {
      dados: {
        serie: serie.map((pt) => ({ ...pt, liquido_fmt: brl(pt.liquido) })),
        totais: { ...totais, liquido_fmt: brl(totais.liquido) },
      },
      meta: proveniencia({
        fonte: "RPC cashflow_daily",
        escopo: `empresa ${companyId}`,
        periodo: periodo.rotulo,
        regime: "caixa",
        linhas: serie.length,
        como_calculado:
          `Movimento datado por cash_date, agrupado por ${granularidade === "mensal" ? "mês" : "dia"}. ` +
          "Entradas e saídas são valores brutos do período; líquido é entradas menos saídas. " +
          "Transferências entre contas da mesma empresa aparecem nos dois lados e se anulam no líquido.",
      }),
    };
  },
};
