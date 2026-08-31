/**
 * Fake de `McpDataSource` para os testes.
 *
 * Registra o que foi pedido — é isso que permite testar a parte que mais importa:
 * não o formato da resposta, mas se a CONSULTA levou os filtros semânticos certos
 * (status por regime, exclusão de transferência, teto de linhas).
 */
import type { McpDataSource, TableQuery } from "./types.ts";

export interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

export interface FakeDataSource extends McpDataSource {
  rpcCalls: RpcCall[];
  queries: TableQuery[];
}

export function fakeDataSource(
  respostas: {
    rpc?: Record<string, unknown[]>;
    query?: Record<string, unknown[]>;
  } = {},
): FakeDataSource {
  const rpcCalls: RpcCall[] = [];
  const queries: TableQuery[] = [];
  return {
    rpcCalls,
    queries,
    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
      rpcCalls.push({ fn, args });
      return (respostas.rpc?.[fn] ?? []) as T[];
    },
    async query<T>(q: TableQuery): Promise<T[]> {
      queries.push(q);
      return (respostas.query?.[q.table] ?? []) as T[];
    },
  };
}

/** Acha um filtro pela coluna e operador, para asserção legível nos testes. */
export function filtroDe(q: TableQuery, column: string, op?: string) {
  return q.filters.find((f) => f.column === column && (op === undefined || f.op === op));
}
