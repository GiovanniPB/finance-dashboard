import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { getReceivablesSchedule, getSales } from "./sales.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const ORG = "99999999-8888-7777-6666-555555555555";
const CONTA_PGM = "aaaaaaaa-1111-2222-3333-444444444444";
const periodo = { from: "2026-07-01", to: "2026-07-31" };

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

describe("get_sales — resumo", () => {
  const resumo = [
    {
      gmv: "50000.00",
      sales_count: 120,
      avg_ticket: "416.67",
      refunded: "1000.00",
      net_sales: "49000.00",
      approval_rate: "92.5",
      attempts_count: 130,
      failed_count: 10,
      customers_count: 88,
      installments_avg: "2.4",
    },
  ];

  it("devolve GMV e venda líquida separados", async () => {
    const d = fakeDataSource({ rpc: { sales_overview: resumo } });
    const r = await getSales.run({ ...periodo }, d);

    expect(dados(r)).toMatchObject({ gmv: 50000, estornado: 1000, venda_liquida: 49000 });
  });

  it("passa null quando a conta não é informada, deixando a RLS recortar", async () => {
    const d = fakeDataSource({ rpc: { sales_overview: resumo } });
    await getSales.run({ ...periodo }, d);

    expect(d.rpcCalls[0].args.p_account_id).toBeNull();
  });

  it("escopa pela conta do pagar.me quando informada", async () => {
    const d = fakeDataSource({ rpc: { sales_overview: resumo } });
    const r = await getSales.run({ ...periodo, pagarme_account_id: CONTA_PGM }, d);

    expect(d.rpcCalls[0].args.p_account_id).toBe(CONTA_PGM);
    expect(r.meta.escopo).toContain(CONTA_PGM);
  });

  it("lida com RPC vazia sem estourar", async () => {
    const d = fakeDataSource({ rpc: { sales_overview: [] } });
    const r = await getSales.run({ ...periodo }, d);

    expect(dados(r).gmv).toBe(0);
  });
});

describe("get_sales — serie e quebra", () => {
  it("traduz a granularidade para o grain do banco", async () => {
    const d = fakeDataSource({ rpc: { sales_timeseries: [] } });
    await getSales.run({ ...periodo, visao: "serie", granularidade: "mensal" }, d);

    expect(d.rpcCalls[0].args.p_grain).toBe("month");
  });

  it("avisa que a série de recusadas é datada por outra coluna", async () => {
    const d = fakeDataSource({ rpc: { sales_timeseries: [] } });
    const r = await getSales.run({ ...periodo, visao: "serie" }, d);

    expect(r.meta.como_calculado).toMatch(/não são comparáveis/);
  });

  it("traduz a dimensão da quebra para o nome do banco", async () => {
    const d = fakeDataSource({ rpc: { sales_breakdown: [] } });
    await getSales.run({ ...periodo, visao: "quebra", dimensao: "bandeira" }, d);

    expect(d.rpcCalls[0].args.p_dimension).toBe("brand");
  });

  it("calcula participação de cada fatia", async () => {
    const d = fakeDataSource({
      rpc: {
        sales_breakdown: [
          { label: "credit_card", amount: "7500.00", sales_count: 30 },
          { label: "pix", amount: "2500.00", sales_count: 20 },
        ],
      },
    });
    const r = await getSales.run({ ...periodo, visao: "quebra" }, d);

    expect(dados(r).fatias.map((f: any) => f.participacao_pct)).toEqual([75, 25]);
  });

  it("declara que a quebra por empresa vem de outra fonte e outra data", async () => {
    const d = fakeDataSource({ rpc: { sales_breakdown: [] } });
    const r = await getSales.run({ ...periodo, visao: "quebra", dimensao: "empresa" }, d);

    expect(r.meta.como_calculado).toMatch(/RECEBÍVEIS/);
    expect(r.meta.como_calculado).toMatch(/pode não bater/);
  });
});

describe("get_sales — clientes", () => {
  it("avisa quando a janela alcança o início do ledger", async () => {
    // "Novo" é relativo ao ledger: cliente antigo apareceria como novo.
    const d = fakeDataSource({
      rpc: {
        sales_customers: [
          {
            new_customers: 40,
            returning_customers: 10,
            new_revenue: "8000.00",
            returning_revenue: "2000.00",
            repeat_rate: "20",
            ledger_since: "2026-07-15T00:00:00Z",
          },
        ],
      },
    });

    const r = await getSales.run({ ...periodo, visao: "clientes" }, d);

    expect(r.meta.avisos?.join(" ")).toMatch(/contado como NOVO/);
  });

  it("não avisa quando o ledger começa antes da janela", async () => {
    const d = fakeDataSource({
      rpc: {
        sales_customers: [
          {
            new_customers: 5,
            returning_customers: 40,
            new_revenue: "1000.00",
            returning_revenue: "9000.00",
            repeat_rate: "88",
            ledger_since: "2025-01-01T00:00:00Z",
          },
        ],
      },
    });

    const r = await getSales.run({ ...periodo, visao: "clientes" }, d);

    expect(r.meta.avisos ?? []).toHaveLength(0);
  });
});

describe("get_sales — recorrencia", () => {
  it("avisa que MRR zerado sem assinatura não é queda", async () => {
    const d = fakeDataSource({
      rpc: {
        sales_recurrence: [
          {
            has_subscriptions: false,
            mrr_active: "0",
            subs_active: 0,
            subs_new: 0,
            subs_canceled: 0,
            churn_rate_logo: "0",
            involuntary_failed: 0,
            contracted_installments: 340,
            contracted_receivables: "250000.00",
          },
        ],
      },
    });

    const r = await getSales.run({ ...periodo, visao: "recorrencia" }, d);

    expect(dados(r).tem_assinaturas).toBe(false);
    expect(r.meta.avisos?.join(" ")).toMatch(/NÃO significam queda/);
    expect(dados(r).recebiveis_contratados).toBe(250000);
  });

  it("não avisa quando há assinatura de fato", async () => {
    const d = fakeDataSource({
      rpc: {
        sales_recurrence: [
          {
            has_subscriptions: true,
            mrr_active: "12000.00",
            subs_active: 40,
            subs_new: 5,
            subs_canceled: 2,
            churn_rate_logo: "5",
            involuntary_failed: 1,
            contracted_installments: 0,
            contracted_receivables: "0",
          },
        ],
      },
    });

    const r = await getSales.run({ ...periodo, visao: "recorrencia" }, d);

    expect(r.meta.avisos ?? []).toHaveLength(0);
  });
});

describe("get_receivables_schedule", () => {
  const meses = [
    {
      month_start: "2026-08-01",
      gross: "10000.00",
      fees: "300.00",
      net: "9700.00",
      installments_count: 50,
      settled_gross: "4000.00",
      pending_gross: "6000.00",
      pending_installments: 30,
    },
  ];

  it("é escopada por EMPRESA, não por conta do pagar.me", async () => {
    const d = fakeDataSource({ rpc: { receivables_schedule: meses } });
    await getReceivablesSchedule.run({ company_id: EMPRESA, ...periodo }, d);

    expect(d.rpcCalls[0].args).toMatchObject({ p_company_id: EMPRESA });
  });

  it("calcula a taxa efetiva sobre o bruto", async () => {
    const d = fakeDataSource({ rpc: { receivables_schedule: meses } });
    const r = await getReceivablesSchedule.run({ company_id: EMPRESA, ...periodo }, d);

    expect(dados(r).totais.taxa_efetiva_pct).toBe(3);
  });

  it("separa liquidado de pendente", async () => {
    const d = fakeDataSource({ rpc: { receivables_schedule: meses } });
    const r = await getReceivablesSchedule.run({ company_id: EMPRESA, ...periodo }, d);

    expect(dados(r).serie[0]).toMatchObject({ liquidado_bruto: 4000, pendente_bruto: 6000 });
  });

  it("no consolidado chama a RPC uma vez por empresa e soma o mês", async () => {
    const d = fakeDataSource({
      query: {
        companies: [
          { id: "emp-a", organization_id: ORG },
          { id: "emp-b", organization_id: ORG },
        ],
      },
      rpc: { receivables_schedule: meses },
    });

    const r = await getReceivablesSchedule.run({ organization_id: ORG, ...periodo }, d);

    expect(d.rpcCalls).toHaveLength(2);
    // O mesmo mês das duas empresas soma numa linha só.
    expect(dados(r).serie).toHaveLength(1);
    expect(dados(r).serie[0].bruto).toBe(20000);
    expect(dados(r).serie[0].parcelas).toBe(100);
  });

  it("exige escopo", async () => {
    await expect(getReceivablesSchedule.run(periodo, fakeDataSource())).rejects.toThrow(
      /list_companies/,
    );
  });
});
