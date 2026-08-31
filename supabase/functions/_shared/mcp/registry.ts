/**
 * Catálogo de tools do servidor MCP.
 *
 * O transporte (Edge Function ou stdio) só conhece este arquivo: pede a lista para
 * anunciar ao cliente, e chama `callTool` quando o modelo escolhe uma. Toda a
 * semântica fica nas tools; o transporte não decide nada.
 */
import { McpParamError } from "./params.ts";
import { getCashflow } from "./tools/cashflow.ts";
import { listCompanies } from "./tools/companies.ts";
import { getDre } from "./tools/dre.ts";
import { searchTransactions } from "./tools/transactions.ts";
import type { JsonSchema, McpDataSource, McpTool, ToolResponse } from "./types.ts";

export const TOOLS: McpTool[] = [listCompanies, getDre, getCashflow, searchTransactions];

export interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
}

/** Descritores no formato que o protocolo MCP anuncia em `tools/list`. */
export function listTools(): ToolDescriptor[] {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export function findTool(name: string): McpTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export interface ToolFailure {
  erro: string;
  /** Erro de parâmetro é recuperável: o modelo corrige e chama de novo. */
  recuperavel: boolean;
}

export type ToolOutcome = ToolResponse | ToolFailure;

export function isFailure(outcome: ToolOutcome): outcome is ToolFailure {
  return "erro" in outcome;
}

/**
 * Executa uma tool e devolve erro estruturado em vez de estourar.
 *
 * O modelo lê o erro e se corrige — por isso a mensagem de `McpParamError` é útil e
 * a de falha inesperada é genérica: não vazamos detalhe interno de banco para o
 * cliente de IA.
 */
export async function callTool(
  name: string,
  params: unknown,
  ds: McpDataSource,
): Promise<ToolOutcome> {
  const tool = findTool(name);
  if (!tool) {
    return {
      erro: `Tool desconhecida: "${name}". Disponíveis: ${TOOLS.map((t) => t.name).join(", ")}.`,
      recuperavel: true,
    };
  }
  try {
    return await tool.run(params, ds);
  } catch (err) {
    if (err instanceof McpParamError) {
      return { erro: err.message, recuperavel: true };
    }
    const detalhe = err instanceof Error ? err.message : String(err);
    return {
      erro: `Falha ao consultar os dados na tool "${name}". Detalhe técnico: ${detalhe}`,
      recuperavel: false,
    };
  }
}
