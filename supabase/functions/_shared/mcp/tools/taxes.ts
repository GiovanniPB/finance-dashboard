/**
 * Obrigações fiscais — o módulo `taxes`, que o catálogo não alcançava.
 *
 * Sem checagem de módulo no servidor, de propósito: `can_view_module('taxes')` já é
 * imposto nas policies de SELECT da tabela, então quem não tem o módulo recebe zero
 * linhas. Duplicar a regra aqui criaria uma segunda versão dela para envelhecer. O
 * que a tool faz é dizer na proveniência que vazio pode ser permissão, não ausência
 * de imposto — que é a única leitura errada possível desse zero.
 */
import { resolverEscopo } from "../escopo.ts";
import { brl, toNumber, truncate } from "../format.ts";
import {
  asObject,
  optionalDate,
  optionalEnum,
  optionalLimit,
  optionalString,
  requireEscopo,
} from "../params.ts";
import { avisoTruncamento, proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, QueryFilter, ToolResponse } from "../types.ts";

export const LIMITE_PADRAO = 100;
export const LIMITE_MAX = 500;

type Situacao = "todas" | "pending" | "paid" | "overdue" | "waived";
const SITUACOES: readonly Situacao[] = ["todas", "pending", "paid", "overdue", "waived"] as const;

interface ObrigacaoRow {
  id: string;
  company_id: string;
  kind: string;
  reference_period: string;
  due_date: string;
  base_amount: string | number | null;
  rate_pct: string | number | null;
  amount_estimated: string | number | null;
  amount_paid: string | number | null;
  paid_at: string | null;
  status: string;
  notes: string | null;
}

export const listTaxObligations: McpTool = {
  name: "list_tax_obligations",
  title: "Obrigações fiscais",
  description:
    "Impostos e obrigações de uma empresa ou do grupo: tipo (DAS do Simples, DARF, GPS, FGTS, ISS, ICMS, " +
    "retenções), período de referência, vencimento, base de cálculo, alíquota, valor estimado e pago. " +
    "Use para 'quanto de imposto vence este mês', 'o DAS de julho foi pago?', 'qual a carga tributária', " +
    "'tem imposto atrasado'. " +
    "Requer o módulo Impostos: sem ele a tool responde vazio, não erro.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description: "UUID da organização, para o grupo inteiro. Alternativa a company_id.",
      },
      vencimento_de: { type: "string", description: "Vencimento mínimo, AAAA-MM-DD." },
      vencimento_ate: { type: "string", description: "Vencimento máximo, AAAA-MM-DD." },
      situacao: {
        type: "string",
        enum: [...SITUACOES],
        description:
          "todas (padrão), pending (a pagar), paid, overdue (vencida e não paga) ou waived (dispensada).",
      },
      tipo: {
        type: "string",
        description:
          "Tipo da obrigação, ex.: das_simples, darf_irpj, darf_csll, darf_pis, darf_cofins, gps_inss, " +
          "fgts, icms, iss, irrf_retencao, inss_retencao, custom.",
      },
      limite: {
        type: "number",
        description: `Máximo de obrigações. Padrão ${LIMITE_PADRAO}, teto ${LIMITE_MAX}.`,
      },
    },
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const escopo = await resolverEscopo(ds, requireEscopo(p));
    const situacao = optionalEnum<Situacao>(p, "situacao", SITUACOES, "todas");
    const tipo = optionalString(p, "tipo");
    const vencimentoDe = optionalDate(p, "vencimento_de");
    const vencimentoAte = optionalDate(p, "vencimento_ate");
    const limite = optionalLimit(p, "limite", LIMITE_PADRAO, LIMITE_MAX);

    const filters: QueryFilter[] = [{ column: "company_id", op: "in", value: escopo.companyIds }];
    if (situacao !== "todas") filters.push({ column: "status", op: "eq", value: situacao });
    if (tipo) filters.push({ column: "kind", op: "eq", value: tipo });
    if (vencimentoDe) filters.push({ column: "due_date", op: "gte", value: vencimentoDe });
    if (vencimentoAte) filters.push({ column: "due_date", op: "lte", value: vencimentoAte });

    const rows = await ds.query<ObrigacaoRow>({
      table: "tax_obligations",
      columns:
        "id,company_id,kind,reference_period,due_date,base_amount,rate_pct," +
        "amount_estimated,amount_paid,paid_at,status,notes",
      filters,
      order: { column: "due_date", ascending: true },
      limit: limite,
    });

    const obrigacoes = rows.map((r) => ({
      id: r.id,
      company_id: r.company_id,
      tipo: r.kind,
      periodo_de_referencia: r.reference_period,
      vencimento: r.due_date,
      base_de_calculo: toNumber(r.base_amount),
      aliquota_pct: r.rate_pct === null ? null : toNumber(r.rate_pct),
      valor_estimado: toNumber(r.amount_estimated),
      valor_pago: toNumber(r.amount_paid),
      valor_estimado_fmt: brl(r.amount_estimated),
      pago_em: r.paid_at,
      situacao: r.status,
      observacao: r.notes ? truncate(r.notes) : null,
    }));

    // Por situação: é o corte que responde "tem imposto atrasado?" sem o modelo
    // precisar contar linha por linha.
    const porSituacao = new Map<string, { obrigacoes: number; estimado: number; pago: number }>();
    for (const o of obrigacoes) {
      const atual = porSituacao.get(o.situacao) ?? { obrigacoes: 0, estimado: 0, pago: 0 };
      porSituacao.set(o.situacao, {
        obrigacoes: atual.obrigacoes + 1,
        estimado: Math.round((atual.estimado + o.valor_estimado) * 100) / 100,
        pago: Math.round((atual.pago + o.valor_pago) * 100) / 100,
      });
    }

    const totalEstimado = obrigacoes.reduce(
      (s, o) => Math.round((s + o.valor_estimado) * 100) / 100,
      0,
    );
    const totalPago = obrigacoes.reduce((s, o) => Math.round((s + o.valor_pago) * 100) / 100, 0);

    return {
      dados: {
        obrigacoes,
        por_situacao: Array.from(porSituacao.entries()).map(([sit, v]) => ({
          situacao: sit,
          obrigacoes: v.obrigacoes,
          valor_estimado: v.estimado,
          valor_estimado_fmt: brl(v.estimado),
          valor_pago: v.pago,
        })),
        total_estimado: totalEstimado,
        total_estimado_fmt: brl(totalEstimado),
        total_pago: totalPago,
      },
      meta: proveniencia({
        fonte: "tabela tax_obligations",
        escopo: escopo.rotulo,
        linhas: obrigacoes.length,
        como_calculado:
          "Obrigações cadastradas para a empresa, ordenadas por vencimento. 'valor_estimado' é o cálculo do " +
          "sistema; 'valor_pago' é o que foi efetivamente quitado, e os dois divergem quando houve multa, " +
          "juros ou pagamento parcial. 'periodo_de_referencia' é a competência do imposto, que não é o mês " +
          "do vencimento — o DAS de julho vence em agosto.",
        avisos: [
          "Esta tool depende do módulo Impostos. Resultado vazio pode significar falta de permissão ao " +
            "módulo, e não ausência de obrigação — não conclua que a empresa não tem imposto a pagar.",
          ...avisoTruncamento(obrigacoes.length, limite),
          ...escopo.avisos,
        ],
      }),
    };
  },
};
