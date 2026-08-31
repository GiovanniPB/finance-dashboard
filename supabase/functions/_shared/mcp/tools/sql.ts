/**
 * SELECT livre dentro da jaula `mcp_api`.
 *
 * Existe para a pergunta que ninguém previu — o resto do catálogo cobre a
 * previsível. A validação NÃO é duplicada aqui: quem decide o que é uma consulta
 * aceitável é o banco (`mcp_api.run_query`), fonte única da verdade. Repetir a
 * regra em TypeScript só criaria duas versões dela, e uma delas ficaria velha.
 *
 * A descrição abaixo é o mapa que o modelo lê antes de escrever SQL: se ela estiver
 * errada ou incompleta, o modelo erra junto. Ela é parte do contrato, não comentário.
 */
import { asObject, optionalLimit, requireString } from "../params.ts";
import { avisoTruncamento, proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";

export const SQL_LIMITE_PADRAO = 200;
export const SQL_LIMITE_MAX = 1000;

const ESQUEMA = `Views disponíveis (schema mcp_api, use o nome sem qualificar):

- empresas(company_id, organization_id, nome, razao_social, cnpj, regime_tributario, holding, ativa)
- contas(account_id, company_id, codigo, conta, tipo, secao_dre, totalizadora, abaixo_da_linha, parent_id, ativa)
- centros_de_custo(cost_center_id, company_id, nome, ativo)
- contrapartes(counterparty_id, organization_id, nome, tipo, documento, ativa)
- transacoes(transaction_id, company_id, empresa, data_competencia, data_caixa, vencimento,
    valor, valor_bruto, direcao, status, entra_em_competencia, entra_em_caixa,
    e_transferencia, e_projecao_pagarme, conta_codigo, conta, conta_tipo, secao_dre,
    centro_de_custo, contraparte, contraparte_documento, descricao, documento,
    cost_center_id, counterparty_id, bank_account_id)

Regras que fazem o número ficar certo:
- some "valor" (já vem com sinal: entrada positiva, saída negativa), nunca "valor_bruto";
- competência: filtre "entra_em_competencia" e date por "data_competencia";
- caixa: filtre "entra_em_caixa" e date por "data_caixa";
- exclua "e_transferencia" de qualquer análise de receita ou despesa;
- em contas, "totalizadora" já é soma de outras linhas — nunca some junto com as analíticas.`;

export const sqlQuery: McpTool = {
  name: "sql_query",
  title: "SQL exploratório (somente leitura)",
  description:
    "Executa UM SELECT somente-leitura sobre as views do schema mcp_api. Use quando nenhuma outra tool " +
    "responder a pergunta — cruzamentos incomuns, agrupamentos que não existem nas tools, séries longas. " +
    "Para DRE, fluxo de caixa e busca de lançamento, prefira as tools dedicadas: são revisadas e mais baratas.\n\n" +
    ESQUEMA +
    "\n\nRestrições: uma instrução só, sem ponto e vírgula, sem comentário, sem outro schema, " +
    "sem escrita. O LIMIT é imposto pelo servidor e o timeout é de 5s.",
  inputSchema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description:
          "A consulta. Deve começar com SELECT ou WITH e referenciar apenas as views listadas.",
      },
      limite: {
        type: "number",
        description: `Máximo de linhas. Padrão ${SQL_LIMITE_PADRAO}, teto ${SQL_LIMITE_MAX}.`,
      },
    },
    required: ["sql"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const sql = requireString(p, "sql", "Escreva um SELECT sobre as views de mcp_api.");
    const limite = optionalLimit(p, "limite", SQL_LIMITE_PADRAO, SQL_LIMITE_MAX);

    const linhas = await ds.rpc<Record<string, unknown>>("mcp_run_query", {
      p_sql: sql,
      p_limit: limite,
    });

    return {
      dados: { linhas },
      meta: proveniencia({
        fonte: "mcp_api.run_query (SQL exploratório)",
        escopo: "views de mcp_api, filtradas pela RLS do usuário",
        linhas: linhas.length,
        como_calculado:
          `Consulta executada como o próprio usuário, em transação somente-leitura, com LIMIT ${limite} ` +
          "imposto por fora da consulta. O que a RLS esconde não aparece aqui — ausência de linha não é " +
          "prova de ausência de fato. SQL executado: " +
          sql,
        avisos: avisoTruncamento(linhas.length, limite),
      }),
    };
  },
};
