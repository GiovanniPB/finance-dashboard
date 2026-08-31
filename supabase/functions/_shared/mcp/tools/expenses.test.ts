import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { expenseBreakdown } from "./expenses.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const ORG = "99999999-8888-7777-6666-555555555555";
const periodo = { from: "2026-07-01", to: "2026-07-31" };

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const contas = [
  {
    account_id: "a1",
    account_code: "4.1.01",
    account_name: "Pessoal",
    kind: "personnel_expense",
    total: "6000.00",
    is_other: false,
  },
  {
    account_id: "a2",
    account_code: "4.1.02",
    account_name: "Aluguel",
    kind: "operating_expense",
    total: "3000.00",
    is_other: false,
  },
  {
    account_id: null,
    account_code: null,
    account_name: "Outros",
    kind: "operating_expense",
    total: "1000.00",
    is_other: true,
  },
];

describe("expense_breakdown", () => {
  const ds = () => fakeDataSource({ rpc: { expense_breakdown: contas } });

  it("calcula a participação de cada conta no total", async () => {
    const r = await expenseBreakdown.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).contas.map((c: any) => c.participacao_pct)).toEqual([60, 30, 10]);
    expect(dados(r).total).toBe(10000);
  });

  it("marca a linha de agrupamento 'Outros'", async () => {
    const r = await expenseBreakdown.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).contas[2]).toMatchObject({ conta: "Outros", agrupamento_outros: true });
  });

  it("passa null no parâmetro do escopo que não foi usado", async () => {
    const d = ds();
    await expenseBreakdown.run({ company_id: EMPRESA, ...periodo }, d);

    expect(d.rpcCalls[0].args).toMatchObject({
      p_company_id: EMPRESA,
      p_organization_id: null,
    });
  });

  it("aceita escopo consolidado", async () => {
    const d = ds();
    await expenseBreakdown.run({ organization_id: ORG, ...periodo }, d);

    expect(d.rpcCalls[0].args).toMatchObject({
      p_company_id: null,
      p_organization_id: ORG,
    });
  });

  it("repassa o top pedido como limite da RPC", async () => {
    const d = ds();
    await expenseBreakdown.run({ company_id: EMPRESA, ...periodo, top: 5 }, d);

    expect(d.rpcCalls[0].args.p_limit).toBe(5);
  });

  it("avisa que não inclui pendente", async () => {
    const r = await expenseBreakdown.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/pending/);
  });

  it("explica o vazio quando a empresa é a holding, que a RPC exclui", async () => {
    // Sem isso, "vazio" seria lido como "a holding não tem despesa".
    const d = fakeDataSource({
      rpc: { expense_breakdown: [] },
      query: { companies: [{ id: EMPRESA, is_holding: true }] },
    });

    const r = await expenseBreakdown.run({ company_id: EMPRESA, ...periodo }, d);

    expect(r.meta.avisos?.join(" ")).toMatch(/HOLDING/);
  });

  it("não inventa o aviso de holding quando a empresa não é holding", async () => {
    const d = fakeDataSource({
      rpc: { expense_breakdown: [] },
      query: { companies: [{ id: EMPRESA, is_holding: false }] },
    });

    const r = await expenseBreakdown.run({ company_id: EMPRESA, ...periodo }, d);

    expect(r.meta.avisos?.join(" ")).not.toMatch(/HOLDING/);
  });

  it("não consulta se é holding quando houve resultado", async () => {
    const d = ds();
    await expenseBreakdown.run({ company_id: EMPRESA, ...periodo }, d);

    expect(d.queries).toHaveLength(0);
  });

  it("devolve percentual nulo quando o total é zero", async () => {
    const d = fakeDataSource({
      rpc: {
        expense_breakdown: [
          {
            account_id: "a1",
            account_code: "4.1",
            account_name: "X",
            kind: "cogs",
            total: "0",
            is_other: false,
          },
        ],
      },
    });

    const r = await expenseBreakdown.run({ company_id: EMPRESA, ...periodo }, d);

    expect(dados(r).contas[0].participacao_pct).toBeNull();
  });

  it("exige escopo e período", async () => {
    await expect(expenseBreakdown.run(periodo, ds())).rejects.toThrow(/list_companies/);
    await expect(expenseBreakdown.run({ company_id: EMPRESA }, ds())).rejects.toThrow(/from/);
  });
});
