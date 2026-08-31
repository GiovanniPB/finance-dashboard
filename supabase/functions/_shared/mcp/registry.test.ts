import { describe, expect, it } from "vitest";

import { fakeDataSource } from "./fixtures.ts";
import { callTool, isFailure, listTools } from "./registry.ts";
import type { McpDataSource } from "./types.ts";

const COMPANY = "11111111-2222-3333-4444-555555555555";

describe("listTools", () => {
  it("anuncia o catálogo com schema de entrada", () => {
    const tools = listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "list_companies",
      "get_dre",
      "get_cashflow",
      "search_transactions",
    ]);
    for (const t of tools) {
      expect(t.inputSchema).toHaveProperty("type", "object");
      expect(t.description.length).toBeGreaterThan(40);
    }
  });
});

describe("callTool", () => {
  it("lista empresas com o id da organização junto", async () => {
    const ds = fakeDataSource({
      query: {
        companies: [
          {
            id: COMPANY,
            organization_id: "org-1",
            legal_name: "OTM Assessoria LTDA",
            trade_name: "OTM Assessoria",
            cnpj: "12345678000199",
            tax_regime: "simples",
            is_holding: false,
            is_active: true,
          },
        ],
      },
    });
    const r = await callTool("list_companies", {}, ds);
    if (isFailure(r)) throw new Error(r.erro);
    expect(r.dados).toMatchObject({
      empresas: [{ company_id: COMPANY, nome: "OTM Assessoria" }],
      organization_ids: ["org-1"],
    });
  });

  it("filtra empresas inativas por padrão", async () => {
    const ds = fakeDataSource({ query: { companies: [] } });
    await callTool("list_companies", {}, ds);
    expect(ds.queries[0].filters).toEqual([{ column: "is_active", op: "eq", value: true }]);
  });

  it("devolve erro recuperável para tool inexistente", async () => {
    const r = await callTool("get_lucro", {}, fakeDataSource());
    expect(isFailure(r) && r.recuperavel).toBe(true);
    expect(isFailure(r) && r.erro).toMatch(/Disponíveis: list_companies/);
  });

  it("transforma erro de parâmetro em orientação, não em stack trace", async () => {
    const r = await callTool("get_dre", { from: "2026-07-01", to: "2026-07-31" }, fakeDataSource());
    expect(isFailure(r) && r.recuperavel).toBe(true);
    expect(isFailure(r) && r.erro).toMatch(/list_companies/);
  });

  it("marca falha de banco como NÃO recuperável", async () => {
    const quebrado: McpDataSource = {
      rpc: () => Promise.reject(new Error("statement timeout")),
      query: () => Promise.reject(new Error("statement timeout")),
    };
    const r = await callTool(
      "get_dre",
      { company_id: COMPANY, from: "2026-07-01", to: "2026-07-31" },
      quebrado,
    );
    expect(isFailure(r) && r.recuperavel).toBe(false);
    expect(isFailure(r) && r.erro).toMatch(/statement timeout/);
  });

  it("nunca deixa exceção vazar para o transporte", async () => {
    const explode: McpDataSource = {
      rpc: () => {
        throw new Error("boom");
      },
      query: () => {
        throw new Error("boom");
      },
    };
    await expect(
      callTool(
        "get_cashflow",
        { company_id: COMPANY, from: "2026-07-01", to: "2026-07-31" },
        explode,
      ),
    ).resolves.toBeDefined();
  });
});
