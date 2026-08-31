/**
 * Estado da esteira de NFS-e.
 *
 * A esteira é uma fila por status na `invoice_jobs` (ver `nfse-system.md`), então a
 * pergunta útil quase nunca é "liste as notas" — é "quantas travaram, e por quê".
 * A tool devolve a contagem por status e, à parte, as falhas recentes com a
 * mensagem de erro, que é o que permite agir.
 *
 * PII: o tomador da nota pode ser pessoa física. O nome vem (sem ele não há como
 * identificar qual nota reemitir) e o documento é mascarado quando é CPF, pela mesma
 * regra do resto do servidor. Não expõe e-mail nem endereço do tomador.
 */
import { resolverEscopo } from "../escopo.ts";
import { brl, maskDocument, toNumber, truncate } from "../format.ts";
import {
  asObject,
  optionalBoolean,
  optionalDate,
  optionalLimit,
  requireEscopo,
} from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, QueryFilter, ToolResponse } from "../types.ts";

export const FALHAS_LIMITE_PADRAO = 20;
export const FALHAS_LIMITE_MAX = 100;
/** Teto de jobs lidos para montar o agregado. */
const AGREGADO_MAX = 2000;

/** Status que significam "parou e precisa de gente". */
const STATUS_TRAVADO = ["rejected", "failed", "pending_review"];
/** Status que significam "ainda andando". */
const STATUS_EM_ANDAMENTO = ["approved", "queued", "submitting", "processing_authorization"];

interface JobRow {
  id: string;
  company_id: string;
  status: string;
  ambiente: string;
  valor_servicos: string | number | null;
  numero_nfse: string | null;
  focus_status: string | null;
  mensagem_sefaz: string | null;
  erros: unknown;
  attempts: number | null;
  tomador_nome: string | null;
  tomador_documento: string | null;
  created_at: string;
  emitida_em: string | null;
}

const COLUNAS =
  "id,company_id,status,ambiente,valor_servicos,numero_nfse,focus_status,mensagem_sefaz," +
  "erros,attempts,tomador_nome,tomador_documento,created_at,emitida_em";

/** Texto do erro, vindo de `mensagem_sefaz` ou do jsonb `erros`. */
export function mensagemDeErro(job: Pick<JobRow, "mensagem_sefaz" | "erros">): string | null {
  if (job.mensagem_sefaz) return truncate(job.mensagem_sefaz, 240);
  if (job.erros === null || job.erros === undefined) return null;
  const texto = typeof job.erros === "string" ? job.erros : JSON.stringify(job.erros);
  return texto === "{}" || texto === "[]" || texto === "null" ? null : truncate(texto, 240);
}

export const nfseStatus: McpTool = {
  name: "nfse_status",
  title: "Estado da emissão de NFS-e",
  description:
    "Situação da esteira de emissão de notas fiscais de serviço: quantas notas em cada status, quanto de " +
    "valor autorizado, e as falhas recentes com a mensagem de erro. " +
    "Use para 'tem nota travada', 'quantas notas emitimos em julho', 'por que esta nota falhou', " +
    "'quanto foi autorizado'. " +
    "Requer o módulo NFS-e: sem ele a tool responde vazio, não erro. " +
    "É SOMENTE LEITURA — não emite, não reemite e não cancela nota.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description: "UUID da organização, para o grupo inteiro. Alternativa a company_id.",
      },
      from: {
        type: "string",
        description:
          "Início do período de CRIAÇÃO do job, AAAA-MM-DD. Omitido = sem limite inferior.",
      },
      to: { type: "string", description: "Fim do período de criação do job, AAAA-MM-DD." },
      incluir_falhas: {
        type: "boolean",
        description: "Padrão: true. Lista as falhas recentes com a mensagem de erro.",
      },
      limite_falhas: {
        type: "number",
        description: `Quantas falhas listar. Padrão ${FALHAS_LIMITE_PADRAO}, teto ${FALHAS_LIMITE_MAX}.`,
      },
    },
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const escopo = await resolverEscopo(ds, requireEscopo(p));
    const from = optionalDate(p, "from");
    const to = optionalDate(p, "to");
    const incluirFalhas = optionalBoolean(p, "incluir_falhas", true);
    const limiteFalhas = optionalLimit(p, "limite_falhas", FALHAS_LIMITE_PADRAO, FALHAS_LIMITE_MAX);

    const filters: QueryFilter[] = [{ column: "company_id", op: "in", value: escopo.companyIds }];
    if (from) filters.push({ column: "created_at", op: "gte", value: from });
    // `created_at` é timestamptz: comparar com a data crua excluiria o próprio dia
    // final. O `T23:59:59` fecha a janela pelo fim do dia pedido.
    if (to) filters.push({ column: "created_at", op: "lte", value: `${to}T23:59:59` });

    const rows = await ds.query<JobRow>({
      table: "invoice_jobs",
      columns: COLUNAS,
      filters,
      order: { column: "created_at", ascending: false },
      limit: AGREGADO_MAX,
    });

    const porStatus = new Map<string, { notas: number; valor: number }>();
    for (const r of rows) {
      const atual = porStatus.get(r.status) ?? { notas: 0, valor: 0 };
      porStatus.set(r.status, {
        notas: atual.notas + 1,
        valor: Math.round((atual.valor + toNumber(r.valor_servicos)) * 100) / 100,
      });
    }

    const somaDe = (statusList: string[]) =>
      statusList.reduce(
        (acc, s) => {
          const v = porStatus.get(s);
          return {
            notas: acc.notas + (v?.notas ?? 0),
            valor: Math.round((acc.valor + (v?.valor ?? 0)) * 100) / 100,
          };
        },
        { notas: 0, valor: 0 },
      );

    const autorizadas = somaDe(["authorized"]);
    const travadas = somaDe(STATUS_TRAVADO);
    const emAndamento = somaDe(STATUS_EM_ANDAMENTO);

    const falhas = incluirFalhas
      ? rows
          .filter((r) => STATUS_TRAVADO.includes(r.status))
          .slice(0, limiteFalhas)
          .map((r) => ({
            id: r.id,
            company_id: r.company_id,
            status: r.status,
            ambiente: r.ambiente,
            valor: toNumber(r.valor_servicos),
            valor_fmt: brl(r.valor_servicos),
            tentativas: r.attempts,
            tomador: r.tomador_nome,
            tomador_documento: maskDocument(r.tomador_documento),
            erro: mensagemDeErro(r),
            status_no_focus: r.focus_status,
            criada_em: r.created_at,
          }))
      : [];

    // Ambiente é o dado mais fácil de ler errado aqui: nota de homologação não vale
    // nada fiscalmente, e somada à de produção dá um total que não existe.
    const porAmbiente = new Map<string, number>();
    for (const r of rows) porAmbiente.set(r.ambiente, (porAmbiente.get(r.ambiente) ?? 0) + 1);

    return {
      dados: {
        por_status: Array.from(porStatus.entries())
          .map(([status, v]) => ({
            status,
            notas: v.notas,
            valor: v.valor,
            valor_fmt: brl(v.valor),
          }))
          .sort((a, b) => b.notas - a.notas),
        resumo: {
          autorizadas: autorizadas.notas,
          valor_autorizado: autorizadas.valor,
          valor_autorizado_fmt: brl(autorizadas.valor),
          travadas: travadas.notas,
          valor_travado: travadas.valor,
          em_andamento: emAndamento.notas,
          total: rows.length,
        },
        por_ambiente: Array.from(porAmbiente.entries()).map(([ambiente, notas]) => ({
          ambiente,
          notas,
        })),
        ...(incluirFalhas ? { falhas } : {}),
      },
      meta: proveniencia({
        fonte: "tabela invoice_jobs",
        escopo: escopo.rotulo,
        periodo:
          from || to ? `criação entre ${from ?? "início"} e ${to ?? "hoje"}` : "todo o período",
        linhas: rows.length,
        como_calculado:
          "Contagem e soma de valor_servicos dos jobs de emissão, agrupados por status da esteira. " +
          "'travadas' = rejected, failed e pending_review (paradas, precisam de ação humana). " +
          "'em_andamento' = approved, queued, submitting e processing_authorization. " +
          "'autorizadas' são as notas efetivamente emitidas. O período filtra a CRIAÇÃO do job, " +
          "não a data de emissão da nota.",
        avisos: [
          "Esta tool depende do módulo NFS-e. Resultado vazio pode significar falta de permissão ao módulo, " +
            "não ausência de nota.",
          ...(porAmbiente.size > 1
            ? [
                "Há notas de mais de um ambiente no resultado (ver por_ambiente). Nota de homologação não tem " +
                  "valor fiscal: não some com produção nem cite o total como faturamento.",
              ]
            : []),
          ...(rows.length >= AGREGADO_MAX
            ? [
                `Agregado montado sobre as ${AGREGADO_MAX} notas mais recentes do filtro; há mais jobs no ` +
                  "período. Estreite o período antes de concluir qualquer total.",
              ]
            : []),
          ...escopo.avisos,
        ],
      }),
    };
  },
};
