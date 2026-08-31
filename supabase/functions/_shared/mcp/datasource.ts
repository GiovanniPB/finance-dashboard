/**
 * Adapter `SupabaseClient` -> `McpDataSource`.
 *
 * É o ÚNICO ponto do MCP que conhece o Supabase, e o último portão antes do banco.
 * Três invariantes valem aqui, e valem para qualquer tool, presente ou futura:
 *
 * - **`*` é proibido** na lista de colunas. Coluna nova numa tabela não passa a
 *   vazar por acidente; alguém tem que escrever o nome dela.
 * - **Toda consulta tem teto**, e o teto tem teto (`TETO_ABSOLUTO`).
 * - **Só leitura.** Não há caminho daqui para insert/update/delete — nem por
 *   parâmetro, nem por composição.
 *
 * O client é criado no transporte com o JWT do usuário (nunca service role), de
 * modo que a RLS decide o que cada pessoa enxerga.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import type { McpDataSource, QueryFilter, TableQuery } from "./types.ts";

/** Nenhuma consulta do MCP lê mais que isto, qualquer que seja a tool. */
export const TETO_ABSOLUTO = 2000;

export class McpDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpDataError";
  }
}

function assertQueryValida(q: TableQuery): void {
  if (q.columns.includes("*")) {
    throw new McpDataError(
      `Consulta a "${q.table}" pediu "*". Liste as colunas explicitamente — é o que impede vazamento de coluna nova.`,
    );
  }
  if (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > TETO_ABSOLUTO) {
    throw new McpDataError(
      `Consulta a "${q.table}" pediu limite ${q.limit}; permitido de 1 a ${TETO_ABSOLUTO}.`,
    );
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- o builder do PostgREST é encadeado e não tipável aqui */
function aplicarFiltro(builder: any, f: QueryFilter): any {
  switch (f.op) {
    case "eq":
      return builder.eq(f.column, f.value);
    case "neq":
      return builder.neq(f.column, f.value);
    case "gt":
      return builder.gt(f.column, f.value);
    case "gte":
      return builder.gte(f.column, f.value);
    case "lt":
      return builder.lt(f.column, f.value);
    case "lte":
      return builder.lte(f.column, f.value);
    case "in":
      return builder.in(f.column, f.value as unknown[]);
    case "ilike":
      return builder.ilike(f.column, f.value as string);
    case "is":
      return builder.is(f.column, f.value as null);
    case "not_is":
      return builder.not(f.column, "is", f.value);
    default: {
      const nunca: never = f.op;
      throw new McpDataError(`Operador de filtro não suportado: ${String(nunca)}`);
    }
  }
}

export function supabaseDataSource(client: SupabaseClient): McpDataSource {
  return {
    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
      const { data, error } = await (client as any).rpc(fn, args);
      if (error) throw new McpDataError(`RPC ${fn}: ${error.message}`);
      return (Array.isArray(data) ? data : data ? [data] : []) as T[];
    },

    async query<T>(q: TableQuery): Promise<T[]> {
      assertQueryValida(q);
      let builder = (client as any).from(q.table).select(q.columns);
      for (const f of q.filters) builder = aplicarFiltro(builder, f);
      if (q.order) {
        builder = builder.order(q.order.column, { ascending: q.order.ascending });
      }
      const { data, error } = await builder.limit(q.limit);
      if (error) throw new McpDataError(`Consulta a ${q.table}: ${error.message}`);
      return (data ?? []) as T[];
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
