import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { costCenterAnalysis, counterpartyAnalysis } from "./analysis.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const periodo = { from: "2026-07-01", to: "2026-07-31" };

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

describe("cost_center_analysis", () => {
  const centros = [
    {
      cost_center_id: "cc-1",
      cost_center_name: "Comercial",
      revenue: "10000.00",
      expense: "4000.00",
      net: "6000.00",
      margin_pct: "60",
      transaction_count: 12,
    },
    {
      cost_center_id: null,
      cost_center_name: "Sem centro de custo",
      revenue: "0",
      expense: "500.00",
      net: "-500.00",
      margin_pct: null,
      transaction_count: 3,
    },
  ];
  const ds = () => fakeDataSource({ rpc: { cost_center_analysis: centros } });

  it("soma o total dos centros", async () => {
    const r = await costCenterAnalysis.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).total).toMatchObject({ receita: 10000, despesa: 4500, resultado: 5500 });
  });

  it("preserva o balde 'Sem centro de custo' em vez de descartá-lo", async () => {
    const r = await costCenterAnalysis.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).centros_de_custo[1]).toMatchObject({
      cost_center_id: null,
      centro_de_custo: "Sem centro de custo",
    });
  });

  it("mantém margem nula quando não houve receita", async () => {
    const r = await costCenterAnalysis.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).centros_de_custo[1].margem_pct).toBeNull();
  });

  it("não busca a série mensal por padrão", async () => {
    const d = ds();
    await costCenterAnalysis.run({ company_id: EMPRESA, ...periodo }, d);

    expect(d.rpcCalls.map((c) => c.fn)).toEqual(["cost_center_analysis"]);
  });

  it("traduz o regime para o enum do banco na série mensal", async () => {
    const d = fakeDataSource({
      rpc: { cost_center_analysis: centros, cost_center_monthly_series: [] },
    });
    await costCenterAnalysis.run(
      { company_id: EMPRESA, ...periodo, incluir_serie_mensal: true, regime: "caixa" },
      d,
    );

    const serie = d.rpcCalls.find((c) => c.fn === "cost_center_monthly_series");
    expect(serie?.args.p_basis).toBe("cash");
  });

  it("avisa que a análise INCLUI transferência entre contas", async () => {
    // Divergência real com search_transactions, que exclui por padrão.
    const r = await costCenterAnalysis.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/transferência/i);
  });

  it("declara que o total do período é sempre competência", async () => {
    const r = await costCenterAnalysis.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(r.meta.regime).toBe("competencia");
  });

  it("exige a empresa", async () => {
    await expect(costCenterAnalysis.run(periodo, ds())).rejects.toThrow(/list_companies/);
  });
});

describe("counterparty_analysis", () => {
  const contrapartes = [
    {
      counterparty_id: "c1",
      counterparty_name: "Cliente Grande",
      counterparty_kind: "customer",
      total_inflow: "7000.00",
      total_outflow: "0",
      net: "7000.00",
      transaction_count: 7,
      avg_ticket: "1000.00",
      last_movement: "2026-07-28",
    },
    {
      counterparty_id: "c2",
      counterparty_name: "Cliente Médio",
      counterparty_kind: "customer",
      total_inflow: "2000.00",
      total_outflow: "0",
      net: "2000.00",
      transaction_count: 4,
      avg_ticket: "500.00",
      last_movement: "2026-07-15",
    },
    {
      counterparty_id: "c3",
      counterparty_name: "Fornecedor",
      counterparty_kind: "supplier",
      total_inflow: "1000.00",
      total_outflow: "3000.00",
      net: "-2000.00",
      transaction_count: 5,
      avg_ticket: "800.00",
      last_movement: "2026-07-20",
    },
  ];
  const ds = () => fakeDataSource({ rpc: { counterparty_analysis: contrapartes } });

  it("calcula a concentração sobre as ENTRADAS, que é o que 'depender de cliente' significa", async () => {
    // Entradas: 7000 + 2000 + 1000 = 10000. O maior é 7000 → 70%.
    const r = await counterpartyAnalysis.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).concentracao_de_entradas).toMatchObject({ top_1_pct: 70, top_3_pct: 100 });
  });

  it("traduz 'todas' para o curinga que a RPC espera", async () => {
    const d = ds();
    await counterpartyAnalysis.run({ company_id: EMPRESA, ...periodo }, d);

    expect(d.rpcCalls[0].args.p_kind).toBe("all");
  });

  it("repassa o tipo pedido sem traduzir", async () => {
    const d = ds();
    await counterpartyAnalysis.run({ company_id: EMPRESA, ...periodo, tipo: "supplier" }, d);

    expect(d.rpcCalls[0].args.p_kind).toBe("supplier");
  });

  it("recusa tipo fora do enum", async () => {
    await expect(
      counterpartyAnalysis.run({ company_id: EMPRESA, ...periodo, tipo: "cliente" }, ds()),
    ).rejects.toThrow(/deve ser um de/);
  });

  it("avisa que a concentração SUPERESTIMA quando o resultado é limitado", async () => {
    // Com limite igual ao número de linhas, o denominador é o recorte, não o todo.
    const d = ds();
    const r = await counterpartyAnalysis.run({ company_id: EMPRESA, ...periodo, limite: 3 }, d);

    expect(r.meta.avisos?.join(" ")).toMatch(/SUPERESTIMAM/);
  });

  it("não avisa de superestimação quando não bateu no limite", async () => {
    const r = await counterpartyAnalysis.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(r.meta.avisos?.join(" ")).not.toMatch(/SUPERESTIMAM/);
  });

  it("avisa que NÃO inclui pendente, ao contrário de cost_center_analysis", async () => {
    const r = await counterpartyAnalysis.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/pending/);
  });

  it("devolve concentração nula quando não houve entrada", async () => {
    const d = fakeDataSource({
      rpc: {
        counterparty_analysis: [
          {
            counterparty_id: "c1",
            counterparty_name: "Fornecedor",
            counterparty_kind: "supplier",
            total_inflow: "0",
            total_outflow: "500.00",
            net: "-500.00",
            transaction_count: 1,
            avg_ticket: "500.00",
            last_movement: "2026-07-01",
          },
        ],
      },
    });

    const r = await counterpartyAnalysis.run({ company_id: EMPRESA, ...periodo }, d);

    expect(dados(r).concentracao_de_entradas.top_1_pct).toBeNull();
  });
});
