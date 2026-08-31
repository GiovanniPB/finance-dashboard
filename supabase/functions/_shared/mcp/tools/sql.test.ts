import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { SQL_LIMITE_MAX, SQL_LIMITE_PADRAO, sqlQuery } from "./sql.ts";

const ds = (linhas: unknown[] = []) => fakeDataSource({ rpc: { mcp_run_query: linhas } });

describe("sql_query", () => {
  it("delega ao wrapper do banco, sem revalidar a consulta aqui", async () => {
    const fake = ds([{ n: 1 }]);
    await sqlQuery.run({ sql: "select count(*) as n from transacoes" }, fake);
    expect(fake.rpcCalls[0]).toEqual({
      fn: "mcp_run_query",
      args: { p_sql: "select count(*) as n from transacoes", p_limit: SQL_LIMITE_PADRAO },
    });
  });

  it("não bloqueia SQL suspeito no cliente — quem decide é o banco", async () => {
    const fake = ds();
    await sqlQuery.run({ sql: "delete from transacoes" }, fake);
    expect(fake.rpcCalls[0].args.p_sql).toBe("delete from transacoes");
  });

  it("corta o limite pedido no teto", async () => {
    const fake = ds();
    await sqlQuery.run({ sql: "select 1", limite: 99999 }, fake);
    expect(fake.rpcCalls[0].args.p_limit).toBe(SQL_LIMITE_MAX);
  });

  it("exige a consulta", async () => {
    await expect(sqlQuery.run({}, ds())).rejects.toThrow(/"sql" é obrigatório/);
  });

  it("registra o SQL executado na proveniência", async () => {
    const r = await sqlQuery.run({ sql: "select 1 as x" }, ds([{ x: 1 }]));
    expect(r.meta.como_calculado).toContain("select 1 as x");
    expect(r.meta.fonte).toContain("run_query");
  });

  it("avisa que ausência de linha não prova ausência de fato — a RLS pode estar escondendo", async () => {
    const r = await sqlQuery.run({ sql: "select 1" }, ds());
    expect(r.meta.como_calculado).toMatch(/ausência de linha não é prova/);
  });

  it("avisa quando o resultado bateu no limite", async () => {
    const cheio = Array.from({ length: 5 }, (_, i) => ({ i }));
    const r = await sqlQuery.run({ sql: "select 1", limite: 5 }, ds(cheio));
    expect(r.meta.avisos?.[0]).toMatch(/truncado em 5 linhas/);
  });
});
