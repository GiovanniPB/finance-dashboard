/**
 * Vendas do pagar.me e o cronograma de recebíveis.
 *
 * Domínio inteiro que o catálogo não alcançava: as views de `mcp_api` cobrem o
 * núcleo financeiro, e vendas ficou fora — nem tool, nem SQL exploratório.
 *
 * Dois recortes que não coincidem, e o modelo precisa saber qual está usando:
 *
 * - **`get_sales` é escopada pela CONTA DO PAGAR.ME**, não pela empresa. Uma conta
 *   pode ter split entre várias empresas do grupo, e a venda inteira pertence à
 *   conta. Sem `pagarme_account_id`, a RLS entrega todas as contas visíveis.
 * - **`get_receivables_schedule` é escopada pela EMPRESA**, porque recebível já é o
 *   dinheiro depois do split — é ele que tem dono.
 *
 * A data também difere: venda é datada por `paid_at` (quando a cobrança foi paga);
 * recebível, pelo mês de liquidação. Um mês de venda alta com parcelamento longo
 * aparece diluído no cronograma, e isso é o certo.
 */
import { resolverEscopo } from "../escopo.ts";
import { brl, toNumber } from "../format.ts";
import { asObject, optionalEnum, optionalUuid, requireEscopo, requirePeriodo } from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";

type Visao = "resumo" | "serie" | "quebra" | "clientes" | "recorrencia";
const VISOES: readonly Visao[] = ["resumo", "serie", "quebra", "clientes", "recorrencia"] as const;

type Granularidade = "diario" | "semanal" | "mensal";
const GRANULARIDADES: readonly Granularidade[] = ["diario", "semanal", "mensal"] as const;
const GRAIN_SQL: Record<Granularidade, "day" | "week" | "month"> = {
  diario: "day",
  semanal: "week",
  mensal: "month",
};

type Dimensao = "meio_de_pagamento" | "parcelas" | "plano" | "bandeira" | "empresa";
const DIMENSOES: readonly Dimensao[] = [
  "meio_de_pagamento",
  "parcelas",
  "plano",
  "bandeira",
  "empresa",
] as const;
const DIMENSAO_SQL: Record<Dimensao, string> = {
  meio_de_pagamento: "payment_method",
  parcelas: "installments",
  plano: "plan",
  bandeira: "brand",
  empresa: "company",
};

interface ResumoRow {
  gmv: string | number | null;
  sales_count: number;
  avg_ticket: string | number | null;
  refunded: string | number | null;
  net_sales: string | number | null;
  approval_rate: string | number | null;
  attempts_count: number;
  failed_count: number;
  customers_count: number;
  installments_avg: string | number | null;
}

interface SerieRow {
  bucket: string;
  gmv: string | number | null;
  sales_count: number;
  avg_ticket: string | number | null;
  failed_count: number;
}

interface QuebraRow {
  label: string;
  amount: string | number | null;
  sales_count: number;
}

interface ClientesRow {
  new_customers: number;
  returning_customers: number;
  new_revenue: string | number | null;
  returning_revenue: string | number | null;
  repeat_rate: string | number | null;
  ledger_since: string | null;
}

interface RecorrenciaRow {
  has_subscriptions: boolean;
  mrr_active: string | number | null;
  subs_active: number;
  subs_new: number;
  subs_canceled: number;
  churn_rate_logo: string | number | null;
  involuntary_failed: number;
  contracted_installments: number;
  contracted_receivables: string | number | null;
}

interface RecebivelRow {
  month_start: string;
  gross: string | number | null;
  fees: string | number | null;
  net: string | number | null;
  installments_count: number;
  settled_gross: string | number | null;
  pending_gross: string | number | null;
  pending_installments: number;
}

function taxa(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Math.round(toNumber(value) * 10) / 10;
}

export const getSales: McpTool = {
  name: "get_sales",
  title: "Vendas do pagar.me",
  description:
    "Vendas processadas no pagar.me, em cinco visões: resumo (GMV, ticket médio, taxa de aprovação, " +
    "estornos), serie (evolução por dia/semana/mês), quebra (por meio de pagamento, parcelas, plano, " +
    "bandeira ou empresa), clientes (novos x recorrentes) e recorrencia (MRR, assinaturas, churn, " +
    "backlog parcelado). " +
    "Escopo é a CONTA DO PAGAR.ME, não a empresa — descubra as contas com " +
    "list_dimensions(tipo=contas_pagarme). Sem pagarme_account_id, agrega todas as contas que você enxerga. " +
    "Datado por quando a cobrança foi PAGA. " +
    "Isto é venda no gateway, não receita contábil: para a DRE use get_dre, e para quando o dinheiro " +
    "entra use get_receivables_schedule.",
  inputSchema: {
    type: "object",
    properties: {
      visao: {
        type: "string",
        enum: [...VISOES],
        description:
          "resumo | serie | quebra | clientes | recorrencia. Padrão: resumo. Cada visão devolve uma resposta diferente.",
      },
      from: { type: "string", description: "Início do período, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período, AAAA-MM-DD." },
      pagarme_account_id: {
        type: "string",
        description:
          "UUID da conta do pagar.me. Use list_dimensions(tipo=contas_pagarme). Omitido = todas as contas visíveis.",
      },
      granularidade: {
        type: "string",
        enum: [...GRANULARIDADES],
        description: "Só na visao=serie. diario (padrão), semanal ou mensal.",
      },
      dimensao: {
        type: "string",
        enum: [...DIMENSOES],
        description:
          "Só na visao=quebra. meio_de_pagamento (padrão), parcelas, plano, bandeira ou empresa.",
      },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const visao = optionalEnum<Visao>(p, "visao", VISOES, "resumo");
    const periodo = requirePeriodo(p);
    const accountId = optionalUuid(p, "pagarme_account_id");

    const escopoRotulo = accountId
      ? `conta pagar.me ${accountId}`
      : "todas as contas pagar.me visíveis para o usuário";
    const args = { p_from: periodo.from, p_to: periodo.to, p_account_id: accountId ?? null };

    if (visao === "resumo") {
      const rows = await ds.rpc<ResumoRow>("sales_overview", args);
      const r = rows[0];
      const gmv = toNumber(r?.gmv);
      return {
        dados: {
          gmv,
          gmv_fmt: brl(gmv),
          vendas: r?.sales_count ?? 0,
          ticket_medio: toNumber(r?.avg_ticket),
          ticket_medio_fmt: brl(r?.avg_ticket),
          estornado: toNumber(r?.refunded),
          venda_liquida: toNumber(r?.net_sales),
          venda_liquida_fmt: brl(r?.net_sales),
          taxa_de_aprovacao_pct: taxa(r?.approval_rate),
          tentativas: r?.attempts_count ?? 0,
          recusadas: r?.failed_count ?? 0,
          clientes: r?.customers_count ?? 0,
          parcelas_media: toNumber(r?.installments_avg),
        },
        meta: proveniencia({
          fonte: "RPC sales_overview",
          escopo: escopoRotulo,
          periodo: periodo.rotulo,
          linhas: rows.length,
          como_calculado:
            "GMV soma as cobranças pagas no período (datadas por paid_at), incluindo as que depois foram " +
            "estornadas; venda_liquida desconta o estorno. taxa_de_aprovacao usa TODAS as tentativas de " +
            "cobrança, aprovadas e recusadas — é por isso que o ledger ingere cobrança recusada. " +
            "GMV é valor no gateway, antes de taxa e antes do split entre empresas.",
        }),
      };
    }

    if (visao === "serie") {
      const granularidade = optionalEnum<Granularidade>(
        p,
        "granularidade",
        GRANULARIDADES,
        "diario",
      );
      const rows = await ds.rpc<SerieRow>("sales_timeseries", {
        ...args,
        p_grain: GRAIN_SQL[granularidade],
      });
      const total = rows.reduce((s, r) => Math.round((s + toNumber(r.gmv)) * 100) / 100, 0);
      return {
        dados: {
          serie: rows.map((r) => ({
            periodo: r.bucket,
            gmv: toNumber(r.gmv),
            gmv_fmt: brl(r.gmv),
            vendas: r.sales_count,
            ticket_medio: toNumber(r.avg_ticket),
            recusadas: r.failed_count,
          })),
          gmv_total: total,
          gmv_total_fmt: brl(total),
        },
        meta: proveniencia({
          fonte: "RPC sales_timeseries",
          escopo: escopoRotulo,
          periodo: periodo.rotulo,
          linhas: rows.length,
          como_calculado:
            `Cobranças pagas agrupadas por ${granularidade}, datadas por paid_at. ` +
            "'recusadas' é datado pela CRIAÇÃO da cobrança, não pelo pagamento (uma cobrança recusada " +
            "nunca tem paid_at) — as duas séries não são comparáveis dia a dia.",
        }),
      };
    }

    if (visao === "quebra") {
      const dimensao = optionalEnum<Dimensao>(p, "dimensao", DIMENSOES, "meio_de_pagamento");
      const rows = await ds.rpc<QuebraRow>("sales_breakdown", {
        ...args,
        p_dimension: DIMENSAO_SQL[dimensao],
      });
      const total = rows.reduce((s, r) => Math.round((s + toNumber(r.amount)) * 100) / 100, 0);
      return {
        dados: {
          dimensao,
          fatias: rows.map((r) => ({
            rotulo: r.label,
            valor: toNumber(r.amount),
            valor_fmt: brl(r.amount),
            vendas: r.sales_count,
            participacao_pct:
              total === 0 ? null : Math.round((toNumber(r.amount) / total) * 1000) / 10,
          })),
          total,
          total_fmt: brl(total),
        },
        meta: proveniencia({
          fonte: "RPC sales_breakdown",
          escopo: escopoRotulo,
          periodo: periodo.rotulo,
          linhas: rows.length,
          como_calculado:
            dimensao === "empresa"
              ? "A quebra por empresa sai dos RECEBÍVEIS, que é onde o split existe, e é datada por " +
                "sale_accrual_at. As outras dimensões saem das cobranças, datadas por paid_at — então o " +
                "total desta quebra pode não bater com o GMV do resumo."
              : "Cobranças pagas no período (paid_at), agrupadas pela dimensão pedida. Inclui cobrança " +
                "posteriormente estornada, igual ao GMV do resumo.",
        }),
      };
    }

    if (visao === "clientes") {
      const rows = await ds.rpc<ClientesRow>("sales_customers", args);
      const r = rows[0];
      const ledgerSince = r?.ledger_since ?? null;
      // "Novo" é relativo ao início do ledger, não à história real do cliente: se a
      // janela começa perto do backfill, cliente antigo é rotulado como novo.
      const janelaPertoDoInicio = ledgerSince !== null && periodo.from <= ledgerSince.slice(0, 10);
      return {
        dados: {
          clientes_novos: r?.new_customers ?? 0,
          clientes_recorrentes: r?.returning_customers ?? 0,
          receita_de_novos: toNumber(r?.new_revenue),
          receita_de_recorrentes: toNumber(r?.returning_revenue),
          taxa_de_recompra_pct: taxa(r?.repeat_rate),
          ledger_comeca_em: ledgerSince,
        },
        meta: proveniencia({
          fonte: "RPC sales_customers",
          escopo: escopoRotulo,
          periodo: periodo.rotulo,
          linhas: rows.length,
          como_calculado:
            "'Novo' significa que a PRIMEIRA compra registrada no ledger do cliente caiu nesta janela. " +
            "É relativo ao histórico que existe no ledger, não à história real do cliente.",
          avisos: janelaPertoDoInicio
            ? [
                `A janela pedida começa em ${periodo.from} e o ledger só tem dado a partir de ${ledgerSince}. ` +
                  "Cliente antigo cuja primeira compra é anterior ao ledger será contado como NOVO. " +
                  "Não conclua aquisição de clientes a partir deste recorte.",
              ]
            : [],
        }),
      };
    }

    // recorrencia
    const rows = await ds.rpc<RecorrenciaRow>("sales_recurrence", args);
    const r = rows[0];
    const temAssinatura = r?.has_subscriptions === true;
    return {
      dados: {
        tem_assinaturas: temAssinatura,
        mrr_ativo: toNumber(r?.mrr_active),
        mrr_ativo_fmt: brl(r?.mrr_active),
        assinaturas_ativas: r?.subs_active ?? 0,
        assinaturas_novas: r?.subs_new ?? 0,
        assinaturas_canceladas: r?.subs_canceled ?? 0,
        churn_pct: taxa(r?.churn_rate_logo),
        falhas_involuntarias: r?.involuntary_failed ?? 0,
        parcelas_contratadas: r?.contracted_installments ?? 0,
        recebiveis_contratados: toNumber(r?.contracted_receivables),
        recebiveis_contratados_fmt: brl(r?.contracted_receivables),
      },
      meta: proveniencia({
        fonte: "RPC sales_recurrence",
        escopo: escopoRotulo,
        periodo: periodo.rotulo,
        linhas: rows.length,
        como_calculado:
          "Recorrência nas DUAS definições, porque o negócio pode ter as duas: assinatura (MRR, " +
          "assinaturas ativas, churn) e parcelado (backlog contratado, em parcelas_contratadas e " +
          "recebiveis_contratados). 'tem_assinaturas' diz qual das duas se aplica.",
        avisos: temAssinatura
          ? []
          : [
              "Não há assinatura nesta conta no período: MRR, churn e contagem de assinaturas vêm zerados e " +
                "NÃO significam queda. A recorrência aqui é a do parcelado — leia parcelas_contratadas e " +
                "recebiveis_contratados.",
            ],
      }),
    };
  },
};

export const getReceivablesSchedule: McpTool = {
  name: "get_receivables_schedule",
  title: "Cronograma de recebíveis do pagar.me",
  description:
    "Curva de recebíveis por mês de liquidação: quanto entra em cada mês, bruto, taxas e líquido, " +
    "separando o que já foi liquidado do que ainda está pendente. " +
    "Use para 'quanto o pagar.me me paga em outubro', 'quanto tenho de recebível em aberto', " +
    "'quanto perco de taxa'. " +
    "Escopo por EMPRESA (o recebível já passou pelo split, então tem dono), diferente de get_sales, " +
    "que é por conta do pagar.me. Datado pelo mês em que o dinheiro cai, não pelo da venda.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description:
          "UUID da organização, para somar as empresas do grupo. Alternativa a company_id.",
      },
      from: { type: "string", description: "Início do período de liquidação, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período de liquidação, AAAA-MM-DD." },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const escopo = await resolverEscopo(ds, requireEscopo(p));
    const periodo = requirePeriodo(p);

    // A RPC aceita UMA empresa por chamada (ou null = todas as visíveis). No
    // consolidado, uma chamada por empresa e soma aqui — é o único jeito de manter
    // o recorte da organização sem incluir empresa de fora dela.
    const porEmpresa = await Promise.all(
      escopo.companyIds.map((companyId) =>
        ds.rpc<RecebivelRow>("receivables_schedule", {
          p_from: periodo.from,
          p_to: periodo.to,
          p_company_id: companyId,
        }),
      ),
    );

    const acc = new Map<string, RecebivelRow & { mes: string }>();
    for (const rows of porEmpresa) {
      for (const r of rows) {
        const mes = r.month_start.slice(0, 7);
        const atual = acc.get(mes);
        acc.set(mes, {
          ...r,
          mes,
          gross: toNumber(atual?.gross) + toNumber(r.gross),
          fees: toNumber(atual?.fees) + toNumber(r.fees),
          net: toNumber(atual?.net) + toNumber(r.net),
          settled_gross: toNumber(atual?.settled_gross) + toNumber(r.settled_gross),
          pending_gross: toNumber(atual?.pending_gross) + toNumber(r.pending_gross),
          installments_count: (atual?.installments_count ?? 0) + r.installments_count,
          pending_installments: (atual?.pending_installments ?? 0) + r.pending_installments,
        });
      }
    }

    const serie = Array.from(acc.values())
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((r) => ({
        mes: r.mes,
        bruto: toNumber(r.gross),
        taxas: toNumber(r.fees),
        liquido: toNumber(r.net),
        liquido_fmt: brl(r.net),
        parcelas: r.installments_count,
        liquidado_bruto: toNumber(r.settled_gross),
        pendente_bruto: toNumber(r.pending_gross),
        pendente_bruto_fmt: brl(r.pending_gross),
        parcelas_pendentes: r.pending_installments,
      }));

    const totais = serie.reduce(
      (s, r) => ({
        bruto: Math.round((s.bruto + r.bruto) * 100) / 100,
        taxas: Math.round((s.taxas + r.taxas) * 100) / 100,
        liquido: Math.round((s.liquido + r.liquido) * 100) / 100,
        pendente: Math.round((s.pendente + r.pendente_bruto) * 100) / 100,
      }),
      { bruto: 0, taxas: 0, liquido: 0, pendente: 0 },
    );

    return {
      dados: {
        serie,
        totais: {
          ...totais,
          liquido_fmt: brl(totais.liquido),
          pendente_fmt: brl(totais.pendente),
          taxa_efetiva_pct:
            totais.bruto === 0 ? null : Math.round((totais.taxas / totais.bruto) * 1000) / 10,
        },
      },
      meta: proveniencia({
        fonte: "RPC receivables_schedule",
        escopo: escopo.rotulo,
        periodo: periodo.rotulo,
        linhas: serie.length,
        como_calculado:
          "Parcelas de recebível agrupadas pelo MÊS DE LIQUIDAÇÃO (quando o dinheiro cai), não pelo mês da " +
          "venda. bruto é o valor da parcela antes da taxa do gateway; liquido = bruto - taxas. " +
          "liquidado_bruto já entrou; pendente_bruto ainda não. " +
          (escopo.consolidado
            ? "Consolidado somado no servidor a partir de uma chamada por empresa da organização."
            : ""),
        avisos: escopo.avisos,
      }),
    };
  },
};
