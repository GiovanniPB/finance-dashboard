import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { agregarPrevisaoPorMes, forecastCashflow, type PontoPrevisto } from "./forecast.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const ponto = (over: Partial<PontoPrevisto>): PontoPrevisto => ({
  periodo: "2026-09-01",
  entradas_esperadas: 0,
  saidas_esperadas: 0,
  entradas_recorrentes: 0,
  saidas_recorrentes: 0,
  entradas_total: 0,
  saidas_total: 0,
  liquido: 0,
  saldo_projetado: 0,
  entradas_pagarme: 0,
  ...over,
});

describe("agregarPrevisaoPorMes", () => {
  it("soma os fluxos do mês", () => {
    const r = agregarPrevisaoPorMes([
      ponto({ periodo: "2026-09-01", entradas_total: 100, liquido: 100 }),
      ponto({ periodo: "2026-09-20", entradas_total: 50, liquido: 50 }),
    ]);

    expect(r[0]).toMatchObject({ periodo: "2026-09", entradas_total: 150, liquido: 150 });
  });

  it("NÃO soma o saldo projetado — usa o do último dia do mês", () => {
    // Saldo é posição, não fluxo. Somar daria um número sem significado, e é o erro
    // que a agregação ingênua comete.
    const r = agregarPrevisaoPorMes([
      ponto({ periodo: "2026-09-01", saldo_projetado: 1000 }),
      ponto({ periodo: "2026-09-30", saldo_projetado: 1500 }),
    ]);

    expect(r[0].saldo_projetado).toBe(1500);
  });

  it("pega o saldo do último dia mesmo com entrada fora de ordem", () => {
    const r = agregarPrevisaoPorMes([
      ponto({ periodo: "2026-09-30", saldo_projetado: 1500 }),
      ponto({ periodo: "2026-09-01", saldo_projetado: 1000 }),
    ]);

    expect(r[0].saldo_projetado).toBe(1500);
  });

  it("mantém a ordem cronológica dos meses", () => {
    const r = agregarPrevisaoPorMes([
      ponto({ periodo: "2026-11-01" }),
      ponto({ periodo: "2026-09-01" }),
      ponto({ periodo: "2026-10-01" }),
    ]);

    expect(r.map((p) => p.periodo)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("não acumula erro de ponto flutuante", () => {
    const r = agregarPrevisaoPorMes([
      ponto({ periodo: "2026-09-01", entradas_total: 0.1 }),
      ponto({ periodo: "2026-09-02", entradas_total: 0.2 }),
    ]);

    expect(r[0].entradas_total).toBe(0.3);
  });
});

describe("forecast_cashflow", () => {
  const dias = [
    {
      day: "2026-09-01",
      inflow_expected: "1000.00",
      outflow_expected: "300.00",
      inflow_recurring: "0",
      outflow_recurring: "0",
      running_balance: "1700.00",
    },
    {
      day: "2026-09-15",
      inflow_expected: "0",
      outflow_expected: "2000.00",
      inflow_recurring: "0",
      outflow_recurring: "100.00",
      running_balance: "-400.00",
    },
    {
      day: "2026-10-01",
      inflow_expected: "0",
      outflow_expected: "0",
      inflow_recurring: "500.00",
      outflow_recurring: "0",
      running_balance: "100.00",
    },
  ];
  const pagarme = [{ day: "2026-09-01", inflow_pagarme: "600.00", fees_pagarme: "20.00" }];

  const ds = () =>
    fakeDataSource({
      rpc: { forecast_cashflow_daily: dias, forecast_pagarme_inflow: pagarme },
    });
  const periodo = { from: "2026-09-01", to: "2026-10-31" };

  it("soma esperado com recorrente no total", async () => {
    const r = await forecastCashflow.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).totais).toMatchObject({ entradas: 1500, saidas: 2400, liquido: -900 });
  });

  it("mantém pagar.me à parte, com nome que diz que já está incluído", async () => {
    const r = await forecastCashflow.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).totais.entradas_pagarme_incluidas_nas_entradas).toBe(600);
    // A soma das entradas NÃO inclui pagar.me como parcela adicional.
    expect(dados(r).totais.entradas).toBe(1500);
  });

  it("avisa explicitamente para não somar pagar.me", async () => {
    const r = await forecastCashflow.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/SUBCONJUNTO/);
  });

  it("não consulta o pagar.me quando desligado", async () => {
    const d = ds();
    await forecastCashflow.run({ company_id: EMPRESA, ...periodo, incluir_pagarme: false }, d);

    expect(d.rpcCalls.map((c) => c.fn)).toEqual(["forecast_cashflow_daily"]);
  });

  it("agrupa por mês por padrão", async () => {
    const r = await forecastCashflow.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).serie.map((p: any) => p.periodo)).toEqual(["2026-09", "2026-10"]);
  });

  it("devolve o diário quando pedido", async () => {
    const r = await forecastCashflow.run(
      { company_id: EMPRESA, ...periodo, granularidade: "diario" },
      ds(),
    );

    expect(dados(r).serie).toHaveLength(3);
  });

  it("aponta o dia em que o saldo fica mais baixo, e se é negativo", async () => {
    const r = await forecastCashflow.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).menor_saldo).toMatchObject({
      data: "2026-09-15",
      saldo: -400,
      negativo: true,
    });
  });

  it("deriva o saldo de abertura do primeiro dia", async () => {
    // 1700 de saldo no primeiro dia, com líquido de 700, significa abertura de 1000.
    const r = await forecastCashflow.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(dados(r).saldo_inicial).toBe(1000);
    expect(dados(r).saldo_final_projetado).toBe(100);
  });

  it("avisa que a abertura pode divergir de get_bank_balances", async () => {
    const r = await forecastCashflow.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/initial_balance_date/);
  });

  it("avisa que é previsão, não realizado", async () => {
    const r = await forecastCashflow.run({ company_id: EMPRESA, ...periodo }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/PREVISÃO/);
  });

  it("lida com resultado vazio sem estourar", async () => {
    const d = fakeDataSource({
      rpc: { forecast_cashflow_daily: [], forecast_pagarme_inflow: [] },
    });

    const r = await forecastCashflow.run({ company_id: EMPRESA, ...periodo }, d);

    expect(dados(r).menor_saldo).toBeNull();
    expect(dados(r).saldo_inicial).toBe(0);
  });

  it("exige a empresa", async () => {
    await expect(forecastCashflow.run(periodo, ds())).rejects.toThrow(/list_companies/);
  });
});
