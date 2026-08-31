import { describe, expect, it, vi } from "vitest";

import { McpDataError, supabaseDataSource, TETO_ABSOLUTO } from "./datasource.ts";
import type { TableQuery } from "./types.ts";

/** Stub encadeável do PostgREST: registra as chamadas e resolve como uma Promise. */
function stubClient(resultado: { data?: unknown; error?: { message: string } } = { data: [] }) {
  const chamadas: { metodo: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  const registra = (metodo: string) =>
    vi.fn((...args: unknown[]) => {
      chamadas.push({ metodo, args });
      return builder;
    });
  for (const m of [
    "select",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "ilike",
    "is",
    "not",
    "order",
  ]) {
    builder[m] = registra(m);
  }
  builder.limit = vi.fn((...args: unknown[]) => {
    chamadas.push({ metodo: "limit", args });
    return Promise.resolve(resultado);
  });
  const client = {
    from: vi.fn((table: string) => {
      chamadas.push({ metodo: "from", args: [table] });
      return builder;
    }),
    rpc: vi.fn((fn: string, args: unknown) => {
      chamadas.push({ metodo: "rpc", args: [fn, args] });
      return Promise.resolve(resultado);
    }),
  };
  return { client, chamadas };
}

const baseQuery: TableQuery = {
  table: "transactions",
  columns: "id,amount",
  filters: [],
  limit: 10,
};

describe("supabaseDataSource.query", () => {
  it("recusa '*' — coluna nova não vaza por acidente", async () => {
    const { client } = stubClient();
    const ds = supabaseDataSource(client as never);
    await expect(ds.query({ ...baseQuery, columns: "*" })).rejects.toThrow(McpDataError);
  });

  it("recusa limite acima do teto absoluto", async () => {
    const { client } = stubClient();
    const ds = supabaseDataSource(client as never);
    await expect(ds.query({ ...baseQuery, limit: TETO_ABSOLUTO + 1 })).rejects.toThrow(
      /permitido de 1 a/,
    );
  });

  it("recusa limite ausente ou zero", async () => {
    const { client } = stubClient();
    const ds = supabaseDataSource(client as never);
    await expect(ds.query({ ...baseQuery, limit: 0 })).rejects.toThrow(McpDataError);
  });

  it("traduz cada operador para o método correspondente", async () => {
    const { client, chamadas } = stubClient();
    const ds = supabaseDataSource(client as never);
    await ds.query({
      ...baseQuery,
      filters: [
        { column: "company_id", op: "eq", value: "c1" },
        { column: "status", op: "in", value: ["settled"] },
        { column: "deleted_at", op: "is", value: null },
        { column: "description", op: "ilike", value: "%x%" },
        { column: "transfer_group_id", op: "not_is", value: null },
      ],
      order: { column: "accrual_date", ascending: false },
    });
    const metodos = chamadas.map((c) => c.metodo);
    expect(metodos).toEqual(["from", "select", "eq", "in", "is", "ilike", "not", "order", "limit"]);
  });

  it("aplica o limite no final da cadeia", async () => {
    const { client, chamadas } = stubClient();
    const ds = supabaseDataSource(client as never);
    await ds.query(baseQuery);
    expect(chamadas.at(-1)).toEqual({ metodo: "limit", args: [10] });
  });

  it("converte erro do PostgREST em McpDataError", async () => {
    const { client } = stubClient({ error: { message: "permission denied" } });
    const ds = supabaseDataSource(client as never);
    await expect(ds.query(baseQuery)).rejects.toThrow(/permission denied/);
  });

  it("devolve lista vazia quando não há dados", async () => {
    const { client } = stubClient({ data: null });
    const ds = supabaseDataSource(client as never);
    await expect(ds.query(baseQuery)).resolves.toEqual([]);
  });
});

describe("supabaseDataSource.rpc", () => {
  it("repassa nome e argumentos", async () => {
    const { client, chamadas } = stubClient({ data: [{ total: 1 }] });
    const ds = supabaseDataSource(client as never);
    await ds.rpc("dre_by_company", { p_company_id: "c1" });
    expect(chamadas[0]).toEqual({
      metodo: "rpc",
      args: ["dre_by_company", { p_company_id: "c1" }],
    });
  });

  it("normaliza retorno escalar em lista", async () => {
    const { client } = stubClient({ data: { total: 1 } });
    const ds = supabaseDataSource(client as never);
    await expect(ds.rpc("company_stats", {})).resolves.toEqual([{ total: 1 }]);
  });

  it("propaga erro da RPC com o nome da função", async () => {
    const { client } = stubClient({ error: { message: "statement timeout" } });
    const ds = supabaseDataSource(client as never);
    await expect(ds.rpc("dre_by_company", {})).rejects.toThrow(/dre_by_company: statement timeout/);
  });
});
