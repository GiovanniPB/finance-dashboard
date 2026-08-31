/**
 * Folha de pagamento, no nível de FECHAMENTO — nunca por pessoa.
 *
 * O escopo do projeto inclui folha (decisão D3), e a LGPD entra aí como requisito, não
 * nota de rodapé. A escolha aqui é deliberada: a tool devolve o total de cada
 * fechamento mensal (fixo, variável, benefícios, encargos) e **não** devolve
 * `payroll_items`, que é salário individual identificável.
 *
 * "Quanto custou a folha de julho" é a pergunta de gestão, e ela se responde com o
 * agregado. "Quanto ganha o funcionário X" não é pergunta que um conector de IA
 * precise responder — e o custo de errar nela é alto e irreversível.
 *
 * O módulo `payroll` é imposto pela RLS, como nas outras tools deste lote.
 */
import { resolverEscopo } from "../escopo.ts";
import { brl, toNumber, truncate } from "../format.ts";
import {
  asObject,
  McpParamError,
  optionalEnum,
  optionalLimit,
  optionalString,
  requireEscopo,
} from "../params.ts";
import { avisoTruncamento, proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, QueryFilter, ToolResponse } from "../types.ts";

export const LIMITE_PADRAO = 36;
export const LIMITE_MAX = 120;

type Situacao = "todas" | "draft" | "approved" | "posted";
const SITUACOES: readonly Situacao[] = ["todas", "draft", "approved", "posted"] as const;

const MES_RE = /^\d{4}-\d{2}$/;

interface RunRow {
  id: string;
  company_id: string;
  reference_month: string;
  status: string;
  total_fixed: string | number | null;
  total_variable: string | number | null;
  total_benefits: string | number | null;
  total_charges: string | number | null;
  posted_at: string | null;
  notes: string | null;
}

/** AAAA-MM -> primeiro dia. `reference_month` é `date` no banco. */
function primeiroDia(mes: string): string {
  return `${mes}-01`;
}

export const payrollSummary: McpTool = {
  name: "payroll_summary",
  title: "Folha de pagamento (fechamentos mensais)",
  description:
    "Custo da folha por mês de referência: salário fixo, variável, benefícios, encargos e o custo total, " +
    "com a situação de cada fechamento (draft, approved, posted). " +
    "Use para 'quanto custou a folha', 'a folha subiu?', 'qual o peso dos encargos', " +
    "'a folha de julho já foi lançada'. " +
    "NÃO devolve dado individual de funcionário — salário por pessoa não é exposto por este servidor, " +
    "por decisão de privacidade. " +
    "Requer o módulo Folha: sem ele a tool responde vazio, não erro.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description: "UUID da organização, para o grupo inteiro. Alternativa a company_id.",
      },
      mes_de: { type: "string", description: "Mês de referência mínimo, AAAA-MM." },
      mes_ate: { type: "string", description: "Mês de referência máximo, AAAA-MM." },
      situacao: {
        type: "string",
        enum: [...SITUACOES],
        description:
          "todas (padrão), draft (em edição), approved (aprovada) ou posted (lançada no financeiro).",
      },
      limite: {
        type: "number",
        description: `Máximo de fechamentos. Padrão ${LIMITE_PADRAO}, teto ${LIMITE_MAX}.`,
      },
    },
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const escopo = await resolverEscopo(ds, requireEscopo(p));
    const situacao = optionalEnum<Situacao>(p, "situacao", SITUACOES, "todas");
    const limite = optionalLimit(p, "limite", LIMITE_PADRAO, LIMITE_MAX);

    const mesDe = optionalString(p, "mes_de");
    const mesAte = optionalString(p, "mes_ate");
    for (const [chave, valor] of [
      ["mes_de", mesDe],
      ["mes_ate", mesAte],
    ] as const) {
      if (valor !== undefined && !MES_RE.test(valor)) {
        throw new McpParamError(`Parâmetro "${chave}", quando informado, deve ser AAAA-MM.`);
      }
    }

    const filters: QueryFilter[] = [{ column: "company_id", op: "in", value: escopo.companyIds }];
    if (situacao !== "todas") filters.push({ column: "status", op: "eq", value: situacao });
    if (mesDe) filters.push({ column: "reference_month", op: "gte", value: primeiroDia(mesDe) });
    if (mesAte) filters.push({ column: "reference_month", op: "lte", value: primeiroDia(mesAte) });

    const rows = await ds.query<RunRow>({
      table: "payroll_runs",
      columns:
        "id,company_id,reference_month,status,total_fixed,total_variable," +
        "total_benefits,total_charges,posted_at,notes",
      filters,
      order: { column: "reference_month", ascending: false },
      limit: limite,
    });

    const fechamentos = rows.map((r) => {
      const fixo = toNumber(r.total_fixed);
      const variavel = toNumber(r.total_variable);
      const beneficios = toNumber(r.total_benefits);
      const encargos = toNumber(r.total_charges);
      const total = Math.round((fixo + variavel + beneficios + encargos) * 100) / 100;
      return {
        id: r.id,
        company_id: r.company_id,
        mes_de_referencia: r.reference_month.slice(0, 7),
        situacao: r.status,
        fixo,
        variavel,
        beneficios,
        encargos,
        custo_total: total,
        custo_total_fmt: brl(total),
        peso_dos_encargos_pct:
          fixo + variavel === 0 ? null : Math.round((encargos / (fixo + variavel)) * 1000) / 10,
        lancada_em: r.posted_at,
        observacao: r.notes ? truncate(r.notes) : null,
      };
    });

    const total = fechamentos.reduce(
      (acc, f) => ({
        fixo: Math.round((acc.fixo + f.fixo) * 100) / 100,
        variavel: Math.round((acc.variavel + f.variavel) * 100) / 100,
        beneficios: Math.round((acc.beneficios + f.beneficios) * 100) / 100,
        encargos: Math.round((acc.encargos + f.encargos) * 100) / 100,
        custo_total: Math.round((acc.custo_total + f.custo_total) * 100) / 100,
      }),
      { fixo: 0, variavel: 0, beneficios: 0, encargos: 0, custo_total: 0 },
    );

    const naoLancados = fechamentos.filter((f) => f.situacao !== "posted").length;

    return {
      dados: {
        fechamentos,
        total_do_periodo: { ...total, custo_total_fmt: brl(total.custo_total) },
      },
      meta: proveniencia({
        fonte: "tabela payroll_runs",
        escopo: escopo.rotulo,
        linhas: fechamentos.length,
        como_calculado:
          "Totais de cada fechamento mensal de folha, como gravados na payroll_runs. " +
          "custo_total = fixo + variável + benefícios + encargos. " +
          "peso_dos_encargos_pct = encargos / (fixo + variável). " +
          "Ordenado do mês mais recente para o mais antigo. " +
          "Nenhum dado individual de funcionário é retornado.",
        avisos: [
          "Esta tool depende do módulo Folha. Resultado vazio pode significar falta de permissão ao módulo, " +
            "não ausência de folha.",
          ...(naoLancados > 0
            ? [
                `${naoLancados} fechamento(s) com situação diferente de 'posted': ainda NÃO foram lançados no ` +
                  "financeiro, portanto não aparecem na DRE nem no fluxo de caixa. O custo de folha aqui e a " +
                  "despesa de pessoal da DRE divergem por esse valor.",
              ]
            : []),
          ...avisoTruncamento(fechamentos.length, limite),
          ...escopo.avisos,
        ],
      }),
    };
  },
};
