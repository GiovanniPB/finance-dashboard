import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { mesAnterior, monthlyBriefing } from "./briefing.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

describe("mesAnterior", () => {
  it("volta um mês dentro do ano", () => {
    expect(mesAnterior("2026-07")).toBe("2026-06");
  });

  it("vira o ano em janeiro", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });

  it("preserva o zero à esquerda", () => {
    expect(mesAnterior("2026-10")).toBe("2026-09");
    expect(mesAnterior("2026-03")).toBe("2026-02");
  });
});

describe("monthly_briefing", () => {
  const dreLinhas = [
    {
      account_id: "sum",
      parent_id: null,
      code: "5",
      name: "(=) Resultado líquido",
      kind: "summary",
      dre_section: "net_result",
      is_summary: true,
      below_the_line: false,
      sort_order: 99,
      total: "0",
      total_cash: "0",
    },
    {
      account_id: "rec",
      parent_id: null,
      code: "3.1.01",
      name: "Receita",
      kind: "revenue",
      dre_section: "gross_revenue",
      is_summary: false,
      below_the_line: false,
      sort_order: 10,
      total: "10000.00",
      total_cash: "8000.00",
    },
    {
      account_id: "desp",
      parent_id: null,
      code: "4.1.01",
      name: "Aluguel",
      kind: "operating_expense",
      dre_section: "fixed_costs",
      is_summary: false,
      below_the_line: false,
      sort_order: 20,
      total: "-3000.00",
      total_cash: "-3000.00",
    },
  ];

  const ds = () =>
    fakeDataSource({
      rpc: {
        dre_by_company: dreLinhas,
        cashflow_daily: [
          { day: "2026-07-05", inflow: "5000.00", outflow: "1000.00", net: "4000.00" },
          { day: "2026-07-20", inflow: "3000.00", outflow: "2000.00", net: "1000.00" },
        ],
        bank_balances_multi: [
          { bank_account_id: "b1", nickname: "Movimento", closing_balance: "12000.00" },
          { bank_account_id: "b2", nickname: "Aplicação", closing_balance: "3000.00" },
        ],
      },
      query: {
        v_bills_aging: [
          {
            company_id: "emp-a",
            direction: "inflow",
            bucket: "due_0_30",
            count: 5,
            total: "9000.00",
          },
          {
            company_id: "emp-a",
            direction: "outflow",
            bucket: "overdue_0_30",
            count: 2,
            total: "1500.00",
          },
        ],
      },
    });

  it("junta resultado, caixa, saldo e aging numa resposta", async () => {
    const r = await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, ds());

    expect(Object.keys(dados(r))).toEqual(
      expect.arrayContaining([
        "resultado",
        "caixa_realizado",
        "saldo_bancario_fim_do_mes",
        "titulos_em_aberto",
      ]),
    );
  });

  it("soma o resultado das contas analíticas acima da linha", async () => {
    const r = await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, ds());

    expect(dados(r).resultado.resultado_do_mes).toBe(7000);
  });

  it("soma o fluxo de caixa realizado do mês", async () => {
    const r = await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, ds());

    expect(dados(r).caixa_realizado).toMatchObject({
      entradas: 8000,
      saidas: 3000,
      liquido: 5000,
    });
  });

  it("pede o saldo no ÚLTIMO DIA DO MÊS, não hoje", async () => {
    // Um mês fechado com o saldo de hoje é a mistura mais fácil de fazer aqui.
    const d = ds();
    await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, d);

    const saldo = d.rpcCalls.find((c) => c.fn === "bank_balances_multi");
    expect(saldo?.args.p_as_of).toBe("2026-07-31");
  });

  it("soma o saldo de todas as contas", async () => {
    const r = await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, ds());

    expect(dados(r).saldo_bancario_fim_do_mes.total).toBe(15000);
  });

  it("separa vencido de a vencer nos títulos", async () => {
    const r = await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, ds());

    expect(dados(r).titulos_em_aberto.a_pagar).toMatchObject({ total: 1500, vencido: 1500 });
    expect(dados(r).titulos_em_aberto.a_receber).toMatchObject({ total: 9000, vencido: 0 });
  });

  it("compara com o mês anterior por padrão, expandindo a janela certa", async () => {
    const d = ds();
    await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, d);

    const dres = d.rpcCalls.filter((c) => c.fn === "dre_by_company");
    expect(dres).toHaveLength(2);
    expect(dres[1].args).toMatchObject({ p_start: "2026-06-01", p_end: "2026-06-30" });
  });

  it("não busca o mês anterior quando a comparação é desligada", async () => {
    const d = ds();
    await monthlyBriefing.run(
      { company_id: EMPRESA, mes: "2026-07", comparar_com_mes_anterior: false },
      d,
    );

    expect(d.rpcCalls.filter((c) => c.fn === "dre_by_company")).toHaveLength(1);
  });

  it("cada bloco aponta a tool que o aprofunda", async () => {
    const r = await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, ds());

    expect(dados(r).resultado.aprofundar_com).toMatch(/get_dre/);
    expect(dados(r).caixa_realizado.aprofundar_com).toMatch(/get_cashflow/);
    expect(dados(r).saldo_bancario_fim_do_mes.aprofundar_com).toMatch(/get_bank_balances/);
    expect(dados(r).titulos_em_aberto.aprofundar_com).toMatch(/get_aging/);
  });

  it("avisa que mistura três regimes e que não se somam", async () => {
    const r = await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/Não some blocos/);
  });

  it("avisa que o aging é a foto de hoje, não do mês pedido", async () => {
    const r = await monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07" }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/foto de HOJE/);
  });

  it("exige a empresa e o mês", async () => {
    await expect(monthlyBriefing.run({ mes: "2026-07" }, ds())).rejects.toThrow(/list_companies/);
    await expect(monthlyBriefing.run({ company_id: EMPRESA }, ds())).rejects.toThrow(/AAAA-MM/);
  });

  it("recusa mês em formato de data completa", async () => {
    await expect(
      monthlyBriefing.run({ company_id: EMPRESA, mes: "2026-07-01" }, ds()),
    ).rejects.toThrow(/AAAA-MM/);
  });
});
