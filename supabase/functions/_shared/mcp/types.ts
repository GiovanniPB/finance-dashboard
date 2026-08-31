/**
 * Contratos do núcleo MCP (camada pura, Deno).
 *
 * Duas ideias sustentam este arquivo:
 *
 * 1. **O núcleo não conhece o Supabase.** As tools falam com `McpDataSource`,
 *    uma interface mínima. O adapter que a implementa vive no transporte
 *    (Edge Function / stdio) e é o único lugar que importa o client. Isso mantém
 *    as tools testáveis por Vitest sem banco e sem mock de rede.
 *
 * 2. **A consulta é declarativa, não encadeada.** `TableQuery` só expressa o que
 *    decidimos permitir: colunas, filtros, ordem e um teto de linhas. Uma tool não
 *    tem como montar uma consulta fora desse contrato — a forma do tipo *é* parte
 *    da contenção, não só ergonomia.
 */

/** Regime contábil. Espelha `public.accounting_basis`, em português para o modelo. */
export type Regime = "competencia" | "caixa";

/** Campo de data usado no recorte. `competencia` = accrual_date, `caixa` = cash_date. */
export type CampoData = "competencia" | "caixa";

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "ilike"
  | "is"
  | "not_is";

export interface QueryFilter {
  column: string;
  op: FilterOp;
  value: unknown;
}

export interface TableQuery {
  table: string;
  /** Lista explícita de colunas. `*` é proibido: PII não sai por acidente. */
  columns: string;
  filters: QueryFilter[];
  order?: { column: string; ascending: boolean };
  /** Teto obrigatório. Nenhuma tool consulta sem limite. */
  limit: number;
}

/** A única porta de saída para o banco. Somente leitura, por construção. */
export interface McpDataSource {
  rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T[]>;
  query<T = Record<string, unknown>>(q: TableQuery): Promise<T[]>;
}

/**
 * Proveniência: viaja em TODA resposta.
 *
 * É o que permite auditar a conclusão da IA sem abrir o dashboard — e o que faz o
 * modelo citar "competência, lançamentos liquidados e pendentes" em vez de dizer
 * um número solto.
 */
export interface Proveniencia {
  fonte: string;
  escopo: string;
  periodo?: string;
  regime?: Regime;
  status_incluidos?: string[];
  moeda?: "BRL";
  linhas: number;
  como_calculado: string;
  /** Avisos que o modelo deve repassar ao usuário (ex.: resultado truncado). */
  avisos?: string[];
}

export interface ToolResponse<T = unknown> {
  dados: T;
  meta: Proveniencia;
}

/** JSON Schema do parâmetro, como o MCP exige. Mantido frouxo de propósito. */
export type JsonSchema = Record<string, unknown>;

export interface McpTool {
  name: string;
  title: string;
  /** Descrição que o modelo lê. Diz o que a tool responde E o que ela não responde. */
  description: string;
  inputSchema: JsonSchema;
  run(params: unknown, ds: McpDataSource): Promise<ToolResponse>;
}
