/**
 * Saldo bancário e extrato — o buraco mais visível do catálogo até aqui.
 *
 * `get_cashflow` diz na própria descrição "NÃO é saldo bancário", e `get_dre`
 * também não responde. Ou seja: "quanto tem em caixa hoje", a pergunta mais
 * frequente que existe num financeiro, não tinha tool.
 *
 * Duas divergências das fontes precisam viajar na proveniência, porque um número
 * de saldo que discorda do fluxo de caixa sem explicação destrói a confiança no
 * servidor inteiro:
 *
 * 1. **Saldo conta só `settled`; fluxo de caixa conta `settled` + `reconciled`.**
 *    `bank_balances_multi` filtra `status = 'settled'`, enquanto `cashflow_daily`
 *    usa `status in ('settled','reconciled')`. Hoje o remoto não tem nenhuma linha
 *    `reconciled`, então a divergência é latente — mas no dia em que a conciliação
 *    começar a ser usada, saldo e fluxo passam a discordar exatamente pelo volume
 *    conciliado. Está na proveniência para que a IA avise em vez de escolher um.
 * 2. **`initial_balance_date` recorta o saldo, e a previsão ignora esse recorte.**
 *    `bank_balances_multi` só soma movimento a partir dessa data; a abertura de
 *    `forecast_cashflow_daily` soma tudo. Logo, saldo de hoje e abertura da
 *    previsão podem não coincidir.
 */
import { resolverEscopo } from "../escopo.ts";
import { brl, toNumber, truncate } from "../format.ts";
import {
  asObject,
  optionalDate,
  optionalLimit,
  requireEscopo,
  requirePeriodo,
  requireUuid,
} from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";

export const EXTRATO_LIMITE_PADRAO = 100;
export const EXTRATO_LIMITE_MAX = 500;

/**
 * A divergência de status, em uma frase, para as duas tools deste arquivo.
 * Uma constante e não texto repetido: se a regra mudar, muda num lugar.
 */
const AVISO_STATUS =
  "Saldo e extrato bancário contam apenas lançamentos com status 'settled'. " +
  "get_cashflow e a DRE em regime de caixa contam 'settled' E 'reconciled'. " +
  "Se houver lançamento conciliado no período, os dois números divergem por esse valor — " +
  "não escolha um dos dois em silêncio, informe a diferença.";

interface SaldoRow {
  company_id: string;
  company_name: string;
  bank_account_id: string;
  bank_name: string;
  nickname: string;
  account_type: string;
  initial_balance: string | number | null;
  inflow: string | number | null;
  outflow: string | number | null;
  closing_balance: string | number | null;
}

interface PeriodoRow {
  opening_balance: string | number | null;
  inflow: string | number | null;
  outflow: string | number | null;
  closing_balance: string | number | null;
}

interface ExtratoRow {
  transaction_id: string;
  cash_date: string;
  description: string;
  direction: "inflow" | "outflow";
  amount: string | number;
  signed_amount: string | number;
  account_code: string | null;
  account_name: string | null;
  counterparty_name: string | null;
  document_ref: string | null;
  is_transfer: boolean | null;
  running_balance: string | number | null;
}

/** Data de hoje em AAAA-MM-DD, UTC. Exportada para o teste poder fixar. */
export function hojeISO(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 10);
}

export const getBankBalances: McpTool = {
  name: "get_bank_balances",
  title: "Saldo das contas bancárias",
  description:
    "Saldo de cada conta bancária numa data, de UMA empresa (company_id) ou de todas as empresas do grupo " +
    "(organization_id), com o movimento que levou até ele. Use para 'quanto temos em caixa', 'saldo por banco', " +
    "'qual conta está negativa'. " +
    "É POSIÇÃO numa data, não movimento de período — para entradas e saídas de um período use get_cashflow, " +
    "e para o saldo projetado no futuro use forecast_cashflow.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description:
          "UUID da organização, para o saldo de todas as empresas do grupo. Alternativa a company_id.",
      },
      data_referencia: {
        type: "string",
        description:
          "Data da posição, AAAA-MM-DD. Se omitida, o servidor usa a data de hoje e informa qual usou na proveniência.",
      },
    },
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const escopo = await resolverEscopo(ds, requireEscopo(p));
    // Exceção deliberada à regra de "nenhum parâmetro implícito": para uma
    // POSIÇÃO, "hoje" é a leitura natural, e a data que o servidor conhece é mais
    // confiável que a que o modelo adivinha. Não é default silencioso — vai para a
    // proveniência e para os avisos.
    const informada = optionalDate(p, "data_referencia");
    const asOf = informada ?? hojeISO();

    const rows = await ds.rpc<SaldoRow>("bank_balances_multi", {
      p_as_of: asOf,
      p_company_ids: escopo.companyIds,
    });

    const contas = rows.map((r) => ({
      company_id: r.company_id,
      empresa: r.company_name,
      bank_account_id: r.bank_account_id,
      banco: r.bank_name,
      apelido: r.nickname,
      tipo: r.account_type,
      saldo_inicial: toNumber(r.initial_balance),
      entradas: toNumber(r.inflow),
      saidas: toNumber(r.outflow),
      saldo: toNumber(r.closing_balance),
      saldo_fmt: brl(r.closing_balance),
    }));

    const total = contas.reduce((s, c) => Math.round((s + c.saldo) * 100) / 100, 0);

    // Total por empresa: no consolidado é a leitura que importa, e somar 20 contas
    // no modelo é justamente o que a regra de "agregado por padrão" evita.
    const porEmpresaMap = new Map<string, { empresa: string; saldo: number }>();
    for (const c of contas) {
      const atual = porEmpresaMap.get(c.company_id) ?? { empresa: c.empresa, saldo: 0 };
      porEmpresaMap.set(c.company_id, {
        empresa: c.empresa,
        saldo: Math.round((atual.saldo + c.saldo) * 100) / 100,
      });
    }
    const porEmpresa = Array.from(porEmpresaMap.entries()).map(([companyId, v]) => ({
      company_id: companyId,
      empresa: v.empresa,
      saldo: v.saldo,
      saldo_fmt: brl(v.saldo),
    }));

    return {
      dados: {
        contas,
        por_empresa: porEmpresa,
        total,
        total_fmt: brl(total),
        data_referencia: asOf,
      },
      meta: proveniencia({
        fonte: "RPC bank_balances_multi",
        escopo: escopo.rotulo,
        periodo: `posição em ${asOf}`,
        linhas: contas.length,
        como_calculado:
          `Saldo = saldo inicial da conta + entradas - saídas liquidadas com cash_date até ${asOf}, ` +
          "contando apenas movimento a partir de initial_balance_date quando ela existe. " +
          "Só contas ativas. Transferência entre contas da mesma empresa aparece nas duas pontas e " +
          "não altera o total da empresa.",
        avisos: [
          AVISO_STATUS,
          ...(informada
            ? []
            : [`Data de referência não informada; usei a data de hoje no servidor: ${asOf}.`]),
          ...escopo.avisos,
        ],
      }),
    };
  },
};

export const getAccountLedger: McpTool = {
  name: "get_account_ledger",
  title: "Extrato de uma conta bancária",
  description:
    "Extrato de UMA conta bancária num período: abertura, cada lançamento liquidado com saldo corrente, e " +
    "fechamento. Use para conferir o saldo de uma conta linha por linha, ou achar o lançamento que explica " +
    "um salto no saldo. " +
    "Exige bank_account_id — descubra com list_dimensions(tipo=contas_bancarias). " +
    "Só traz lançamento liquidado: pendente e agendado não aparecem.",
  inputSchema: {
    type: "object",
    properties: {
      bank_account_id: {
        type: "string",
        description: "UUID da conta bancária. Use list_dimensions(tipo=contas_bancarias).",
      },
      from: { type: "string", description: "Início do período, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período, AAAA-MM-DD." },
      limite: {
        type: "number",
        description: `Máximo de lançamentos. Padrão ${EXTRATO_LIMITE_PADRAO}, teto ${EXTRATO_LIMITE_MAX}.`,
      },
    },
    required: ["bank_account_id", "from", "to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const bankAccountId = requireUuid(
      p,
      "bank_account_id",
      'Use a tool "list_dimensions" com tipo=contas_bancarias.',
    );
    const periodo = requirePeriodo(p);
    const limite = optionalLimit(p, "limite", EXTRATO_LIMITE_PADRAO, EXTRATO_LIMITE_MAX);

    const [resumoRows, linhasRows] = await Promise.all([
      ds.rpc<PeriodoRow>("bank_account_period", {
        p_bank_account_id: bankAccountId,
        p_from: periodo.from,
        p_to: periodo.to,
      }),
      ds.rpc<ExtratoRow>("bank_account_ledger", {
        p_bank_account_id: bankAccountId,
        p_from: periodo.from,
        p_to: periodo.to,
      }),
    ]);

    const resumoRow = resumoRows[0];
    const resumo = {
      saldo_abertura: toNumber(resumoRow?.opening_balance),
      entradas: toNumber(resumoRow?.inflow),
      saidas: toNumber(resumoRow?.outflow),
      saldo_fechamento: toNumber(resumoRow?.closing_balance),
      saldo_fechamento_fmt: brl(resumoRow?.closing_balance),
    };

    // O corte é nas ÚLTIMAS linhas, não nas primeiras: o extrato vem em ordem
    // cronológica e o saldo corrente só faz sentido lido do começo. Cortar o fim
    // preserva a cadeia de saldo; cortar o começo entregaria saldo sem origem.
    const truncou = linhasRows.length > limite;
    const linhas = linhasRows.slice(0, limite);

    return {
      dados: {
        resumo,
        lancamentos: linhas.map((r) => ({
          id: r.transaction_id,
          data_caixa: r.cash_date,
          descricao: truncate(r.description),
          valor: toNumber(r.signed_amount),
          valor_fmt: brl(r.signed_amount),
          saldo_corrente: toNumber(r.running_balance),
          saldo_corrente_fmt: brl(r.running_balance),
          conta_codigo: r.account_code,
          conta: r.account_name,
          contraparte: r.counterparty_name,
          documento: r.document_ref,
          transferencia: r.is_transfer === true,
        })),
      },
      meta: proveniencia({
        fonte: "RPCs bank_account_period + bank_account_ledger",
        escopo: `conta bancária ${bankAccountId}`,
        periodo: periodo.rotulo,
        linhas: linhas.length,
        como_calculado:
          "Abertura = saldo inicial da conta + movimento liquidado anterior ao período. Cada linha traz o " +
          "saldo corrente acumulado desde a abertura, em ordem cronológica. Valor com sinal: entrada " +
          "positiva, saída negativa. Transferência entre contas vem marcada e não é receita nem despesa.",
        avisos: [
          AVISO_STATUS,
          ...(truncou
            ? [
                `Extrato cortado nos primeiros ${limite} de ${linhasRows.length} lançamentos, para preservar a ` +
                  "cadeia do saldo corrente. O saldo de fechamento em 'resumo' considera o período INTEIRO e " +
                  "continua correto; o saldo corrente da última linha exibida, não.",
              ]
            : []),
        ],
      }),
    };
  },
};
