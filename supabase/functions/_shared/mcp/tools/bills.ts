/**
 * Contas a pagar e a receber: aging por faixa e a lista dos títulos em aberto.
 *
 * Duas coisas que o modelo não adivinha lendo a view, e que decidem se a resposta
 * presta:
 *
 * 1. **O eixo do aging é a linha do tempo inteira, não só o atraso.** Com as
 *    recorrências materializadas 12 meses à frente, um balde único "a vencer"
 *    concentrava quase todo o valor e parava de informar (migration
 *    `aging_por_faixa_de_vencimento`). São quatro faixas de cada lado do
 *    vencimento, mais uma para título sem data.
 * 2. **Título "em aberto" inclui o futuro agendado.** Boa parte do que aparece aqui
 *    é ocorrência futura de recorrência, não dívida vencida. Somar tudo e chamar de
 *    "dívida" é o erro fácil; a proveniência separa vencido de a vencer para que a
 *    IA não o cometa.
 */
import { resolverEscopo } from "../escopo.ts";
import { brl, toNumber, truncate } from "../format.ts";
import {
  asObject,
  optionalBoolean,
  optionalDate,
  optionalEnum,
  optionalLimit,
  optionalUuid,
  requireEscopo,
} from "../params.ts";
import { avisoTruncamento, proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, QueryFilter, ToolResponse } from "../types.ts";

export const TITULOS_LIMITE_PADRAO = 50;
export const TITULOS_LIMITE_MAX = 300;

type Direcao = "a_receber" | "a_pagar" | "ambas";
const DIRECOES: readonly Direcao[] = ["a_receber", "a_pagar", "ambas"] as const;

type Origem = "todas" | "pagarme" | "manual";
const ORIGENS: readonly Origem[] = ["todas", "pagarme", "manual"] as const;

/** a_receber = inflow (alguém nos deve); a_pagar = outflow. */
const COLUNA_DIRECAO: Record<Exclude<Direcao, "ambas">, "inflow" | "outflow"> = {
  a_receber: "inflow",
  a_pagar: "outflow",
};

/**
 * As faixas do aging, em ordem cronológica, com rótulo legível.
 *
 * A ordem é dado, não apresentação: a view devolve as faixas em ordem arbitrária de
 * agregação, e uma IA que as leia fora de ordem descreve a curva errada.
 */
export const FAIXAS: readonly { bucket: string; rotulo: string; vencido: boolean }[] = [
  { bucket: "overdue_90_plus", rotulo: "Vencido há mais de 90 dias", vencido: true },
  { bucket: "overdue_61_90", rotulo: "Vencido há 61-90 dias", vencido: true },
  { bucket: "overdue_31_60", rotulo: "Vencido há 31-60 dias", vencido: true },
  { bucket: "overdue_0_30", rotulo: "Vencido há até 30 dias", vencido: true },
  { bucket: "due_0_30", rotulo: "Vence nos próximos 30 dias", vencido: false },
  { bucket: "due_31_60", rotulo: "Vence em 31-60 dias", vencido: false },
  { bucket: "due_61_90", rotulo: "Vence em 61-90 dias", vencido: false },
  { bucket: "due_90_plus", rotulo: "Vence em mais de 90 dias", vencido: false },
  { bucket: "no_due_date", rotulo: "Sem data de vencimento", vencido: false },
] as const;

interface AgingRow {
  company_id: string;
  direction: "inflow" | "outflow";
  bucket: string;
  count: number;
  total: string | number | null;
}

interface TituloRow {
  id: string;
  company_id: string;
  direction: "inflow" | "outflow";
  status: string;
  effective_status: string;
  amount: string | number;
  paid_amount: string | number | null;
  open_amount: string | number | null;
  due_date: string | null;
  days_overdue: number | null;
  accrual_date: string;
  description: string;
  document_ref: string | null;
  installment_n: number | null;
  installment_total: number | null;
  pagarme_projection_key: string | null;
  counterparties: { name: string } | null;
  chart_of_accounts: { code: string; name: string } | null;
}

/**
 * Colunas do título. Os embeds precisam da DICA de foreign key (`!fk`) porque
 * `v_bills` é view sobre `transactions`: sem a dica o PostgREST não sabe qual
 * relação usar e a consulta falha.
 */
const COLUNAS_TITULO =
  "id,company_id,direction,status,effective_status,amount,paid_amount,open_amount," +
  "due_date,days_overdue,accrual_date,description,document_ref," +
  "installment_n,installment_total,pagarme_projection_key," +
  "counterparties!transactions_counterparty_id_fkey(name)," +
  "chart_of_accounts!transactions_account_id_fkey(code,name)";

/** Status de `effective_status` que significam "ainda em aberto". */
const STATUS_ABERTO = ["open", "partial", "overdue"];

export interface FaixaAgregada {
  faixa: string;
  rotulo: string;
  vencido: boolean;
  titulos: number;
  total: number;
  total_fmt: string;
}

/** Soma as linhas da view nas faixas canônicas, na ordem canônica. */
export function agregarFaixas(rows: AgingRow[]): FaixaAgregada[] {
  return FAIXAS.map((f) => {
    const doBucket = rows.filter((r) => r.bucket === f.bucket);
    const total = doBucket.reduce((s, r) => Math.round((s + toNumber(r.total)) * 100) / 100, 0);
    return {
      faixa: f.bucket,
      rotulo: f.rotulo,
      vencido: f.vencido,
      titulos: doBucket.reduce((s, r) => s + (r.count ?? 0), 0),
      total,
      total_fmt: brl(total),
    };
  }).filter((f) => f.titulos > 0);
}

export const getAging: McpTool = {
  name: "get_aging",
  title: "Aging de contas a pagar e a receber",
  description:
    "Distribuição dos títulos EM ABERTO por faixa de vencimento, de uma empresa ou do grupo consolidado. " +
    "Quatro faixas de vencido (até 30, 31-60, 61-90, +90 dias) e quatro de a vencer, na mesma régua, " +
    "mais uma faixa para título sem data. Use para 'quanto vence nos próximos 30 dias', 'quanto está " +
    "vencido', 'qual a saúde da carteira'. " +
    "Atenção: 'a vencer' inclui ocorrência FUTURA de recorrência já materializada, que é previsão, não dívida " +
    "contratada vencida. A soma das faixas é o total em aberto.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description: "UUID da organização, para o consolidado do grupo. Alternativa a company_id.",
      },
      direcao: {
        type: "string",
        enum: [...DIRECOES],
        description:
          "a_receber (o que entra), a_pagar (o que sai) ou ambas (padrão, separando as duas).",
      },
    },
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const escopo = await resolverEscopo(ds, requireEscopo(p));
    const direcao = optionalEnum<Direcao>(p, "direcao", DIRECOES, "ambas");

    const filters: QueryFilter[] = [{ column: "company_id", op: "in", value: escopo.companyIds }];
    if (direcao !== "ambas") {
      filters.push({ column: "direction", op: "eq", value: COLUNA_DIRECAO[direcao] });
    }

    const rows = await ds.query<AgingRow>({
      table: "v_bills_aging",
      columns: "company_id,direction,bucket,count,total",
      filters,
      order: { column: "bucket", ascending: true },
      limit: 500,
    });

    const daDirecao = (d: "inflow" | "outflow") => rows.filter((r) => r.direction === d);
    const somaDe = (faixas: FaixaAgregada[]) => ({
      total: faixas.reduce((s, f) => Math.round((s + f.total) * 100) / 100, 0),
      vencido: faixas
        .filter((f) => f.vencido)
        .reduce((s, f) => Math.round((s + f.total) * 100) / 100, 0),
      a_vencer: faixas
        .filter((f) => !f.vencido)
        .reduce((s, f) => Math.round((s + f.total) * 100) / 100, 0),
    });

    const montar = (d: "inflow" | "outflow") => {
      const faixas = agregarFaixas(daDirecao(d));
      const s = somaDe(faixas);
      return {
        faixas,
        total: s.total,
        total_fmt: brl(s.total),
        vencido: s.vencido,
        vencido_fmt: brl(s.vencido),
        a_vencer: s.a_vencer,
        a_vencer_fmt: brl(s.a_vencer),
      };
    };

    const dados: Record<string, unknown> = {};
    if (direcao === "ambas" || direcao === "a_receber") dados.a_receber = montar("inflow");
    if (direcao === "ambas" || direcao === "a_pagar") dados.a_pagar = montar("outflow");

    return {
      dados,
      meta: proveniencia({
        fonte: "view v_bills_aging",
        escopo: escopo.rotulo,
        linhas: rows.length,
        como_calculado:
          "Títulos com effective_status diferente de paid e canceled, somados por open_amount (valor ainda " +
          "aberto, já descontado o que foi pago) e classificados pela distância até o vencimento. " +
          "'vencido' inclui o que vence hoje. Título sem vencimento tem faixa própria e entra no total. " +
          "A soma das faixas é o total em aberto.",
        avisos: [
          "As faixas de 'a vencer' incluem ocorrências futuras de recorrência já materializadas: é previsão " +
            "contratada, não dívida vencida. Não some vencido com a vencer e chame o resultado de inadimplência.",
          ...escopo.avisos,
        ],
      }),
    };
  },
};

export const listOpenBills: McpTool = {
  name: "list_open_bills",
  title: "Títulos em aberto",
  description:
    "Lista os títulos EM ABERTO (a pagar ou a receber) de uma empresa ou do grupo, com vencimento, valor " +
    "aberto, dias de atraso e contraparte. Use para 'o que vence esta semana', 'quem está me devendo', " +
    "'quais boletos estão vencidos', 'os cinco maiores títulos a pagar'. " +
    "Para a distribuição por faixa em vez da lista, use get_aging. " +
    "Para lançamento já liquidado, use search_transactions — esta tool só traz o que está aberto.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description: "UUID da organização, para o consolidado do grupo. Alternativa a company_id.",
      },
      direcao: {
        type: "string",
        enum: [...DIRECOES],
        description: "a_receber, a_pagar ou ambas (padrão).",
      },
      vencimento_de: { type: "string", description: "Vencimento mínimo, AAAA-MM-DD." },
      vencimento_ate: { type: "string", description: "Vencimento máximo, AAAA-MM-DD." },
      apenas_vencidos: {
        type: "boolean",
        description: "Padrão: false. true traz só o que já passou do vencimento.",
      },
      counterparty_id: {
        type: "string",
        description: "UUID da contraparte. Use list_dimensions(tipo=contrapartes).",
      },
      valor_minimo: { type: "number", description: "Valor aberto mínimo do título." },
      origem: {
        type: "string",
        enum: [...ORIGENS],
        description:
          "todas (padrão), pagarme (título gerado pela projeção de recebíveis) ou manual (lançado por uma pessoa).",
      },
      ordenar_por: {
        type: "string",
        enum: ["vencimento", "valor"],
        description: "vencimento (padrão, mais antigo primeiro) ou valor (maior primeiro).",
      },
      limite: {
        type: "number",
        description: `Máximo de títulos. Padrão ${TITULOS_LIMITE_PADRAO}, teto ${TITULOS_LIMITE_MAX}.`,
      },
    },
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const escopo = await resolverEscopo(ds, requireEscopo(p));
    const direcao = optionalEnum<Direcao>(p, "direcao", DIRECOES, "ambas");
    const origem = optionalEnum<Origem>(p, "origem", ORIGENS, "todas");
    const ordenarPor = optionalEnum<"vencimento" | "valor">(
      p,
      "ordenar_por",
      ["vencimento", "valor"] as const,
      "vencimento",
    );
    const apenasVencidos = optionalBoolean(p, "apenas_vencidos", false);
    const vencimentoDe = optionalDate(p, "vencimento_de");
    const vencimentoAte = optionalDate(p, "vencimento_ate");
    const counterpartyId = optionalUuid(p, "counterparty_id");
    const limite = optionalLimit(p, "limite", TITULOS_LIMITE_PADRAO, TITULOS_LIMITE_MAX);

    const filters: QueryFilter[] = [
      { column: "company_id", op: "in", value: escopo.companyIds },
      { column: "effective_status", op: "in", value: STATUS_ABERTO },
    ];
    if (direcao !== "ambas") {
      filters.push({ column: "direction", op: "eq", value: COLUNA_DIRECAO[direcao] });
    }
    if (apenasVencidos) {
      filters.push({ column: "effective_status", op: "eq", value: "overdue" });
    }
    if (vencimentoDe) filters.push({ column: "due_date", op: "gte", value: vencimentoDe });
    if (vencimentoAte) filters.push({ column: "due_date", op: "lte", value: vencimentoAte });
    if (counterpartyId) {
      filters.push({ column: "counterparty_id", op: "eq", value: counterpartyId });
    }
    if (origem === "pagarme") {
      filters.push({ column: "pagarme_projection_key", op: "not_is", value: null });
    } else if (origem === "manual") {
      filters.push({ column: "pagarme_projection_key", op: "is", value: null });
    }
    const valorMinimo = p.valor_minimo;
    if (typeof valorMinimo === "number") {
      filters.push({ column: "open_amount", op: "gte", value: valorMinimo });
    }

    const rows = await ds.query<TituloRow>({
      table: "v_bills",
      columns: COLUNAS_TITULO,
      filters,
      order:
        ordenarPor === "valor"
          ? { column: "open_amount", ascending: false }
          : { column: "due_date", ascending: true },
      limit: limite,
    });

    const totalAberto = rows.reduce(
      (s, r) => Math.round((s + toNumber(r.open_amount)) * 100) / 100,
      0,
    );

    return {
      dados: {
        titulos: rows.map((r) => ({
          id: r.id,
          company_id: r.company_id,
          tipo: r.direction === "inflow" ? "a_receber" : "a_pagar",
          situacao: r.effective_status,
          vencimento: r.due_date,
          dias_de_atraso: r.days_overdue !== null && r.days_overdue > 0 ? r.days_overdue : null,
          dias_para_vencer: r.days_overdue !== null && r.days_overdue < 0 ? -r.days_overdue : null,
          valor_original: toNumber(r.amount),
          valor_pago: toNumber(r.paid_amount),
          valor_aberto: toNumber(r.open_amount),
          valor_aberto_fmt: brl(r.open_amount),
          descricao: truncate(r.description),
          documento: r.document_ref,
          contraparte: r.counterparties?.name ?? null,
          conta_codigo: r.chart_of_accounts?.code ?? null,
          conta: r.chart_of_accounts?.name ?? null,
          parcela:
            r.installment_n && r.installment_total
              ? `${r.installment_n}/${r.installment_total}`
              : null,
          origem: r.pagarme_projection_key !== null ? "pagarme" : "manual",
          data_competencia: r.accrual_date,
        })),
        total_aberto: totalAberto,
        total_aberto_fmt: brl(totalAberto),
        titulos_listados: rows.length,
      },
      meta: proveniencia({
        fonte: "view v_bills",
        escopo: escopo.rotulo,
        linhas: rows.length,
        como_calculado:
          "Títulos com effective_status em open, partial ou overdue (o que ainda tem valor aberto). " +
          "'valor_aberto' já desconta o que foi pago. 'total_aberto' soma APENAS os títulos listados — " +
          "se o resultado truncou, não é o total da carteira; para o total use get_aging. " +
          "CPF de contraparte não é exposto aqui.",
        avisos: [...avisoTruncamento(rows.length, limite), ...escopo.avisos],
      }),
    };
  },
};
