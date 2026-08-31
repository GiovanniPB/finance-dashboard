import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { getKpis, mapearMes as mapear, totalizarAno } from "./kpis.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const ORG = "99999999-8888-7777-6666-555555555555";

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const mesRpc = (mes: string, over: Record<string, unknown> = {}) => ({
  month_start: `${mes}-01`,
  gross_revenue: "0",
  revenue_deductions: "0",
  net_revenue: "0",
  cogs: "0",
  contribution_margin: "0",
  fixed_costs: "0",
  financial_result: "0",
  net_result: "0",
  dividends: "0",
  partner_bonus: "0",
  partner_reimbursement: "0",
  cash_generation: "0",
  gross_margin_pct: "0",
  net_margin_pct: "0",
  effective_tax_rate_pct: "0",
  ...over,
});

const doisMeses = [
  mesRpc("2026-01", {
    gross_revenue: "1000.00",
    contribution_margin: "600.00",
    net_result: "200.00",
    revenue_deductions: "100.00",
    cash_generation: "150.00",
    gross_margin_pct: "60",
    net_margin_pct: "20",
  }),
  mesRpc("2026-02", {
    gross_revenue: "3000.00",
    contribution_margin: "900.00",
    net_result: "100.00",
    revenue_deductions: "300.00",
    cash_generation: "50.00",
    gross_margin_pct: "30",
    net_margin_pct: "3.3",
  }),
];

describe("totalizarAno", () => {
  it("soma os campos somáveis", () => {
    const total = totalizarAno(doisMeses.map((r) => mapear(r)));

    expect(total.receita_bruta).toBe(4000);
    expect(total.resultado_liquido).toBe(300);
  });

  it("RECALCULA o percentual sobre os totais, não faz média dos meses", () => {
    // A média de 60% e 30% seria 45%. O correto é 1500/4000 = 37,5%.
    const total = totalizarAno(doisMeses.map((r) => mapear(r)));

    expect(total.margem_bruta_pct).toBe(37.5);
  });

  it("margem líquida do ano também sai dos totais", () => {
    const total = totalizarAno(doisMeses.map((r) => mapear(r)));

    expect(total.margem_liquida_pct).toBe(7.5);
  });

  it("devolve percentual nulo quando não houve receita", () => {
    const total = totalizarAno([mapear(mesRpc("2026-01"))]);

    expect(total.margem_bruta_pct).toBeNull();
    expect(total.margem_liquida_pct).toBeNull();
  });
});

describe("get_kpis", () => {
  const ds = () => fakeDataSource({ rpc: { kpi_dashboard: doisMeses } });

  it("usa a RPC por empresa quando vem company_id", async () => {
    const d = ds();
    await getKpis.run({ company_id: EMPRESA, ano: 2026 }, d);

    expect(d.rpcCalls[0]).toEqual({
      fn: "kpi_dashboard",
      args: { p_company_id: EMPRESA, p_year: 2026 },
    });
  });

  it("usa a RPC consolidada quando vem organization_id", async () => {
    const d = fakeDataSource({ rpc: { kpi_dashboard_consolidated: doisMeses } });
    await getKpis.run({ organization_id: ORG, ano: 2026 }, d);

    expect(d.rpcCalls[0]).toEqual({
      fn: "kpi_dashboard_consolidated",
      args: { p_organization_id: ORG, p_year: 2026 },
    });
  });

  it("omite mês sem movimento por padrão", async () => {
    const d = fakeDataSource({ rpc: { kpi_dashboard: [...doisMeses, mesRpc("2026-03")] } });
    const r = await getKpis.run({ company_id: EMPRESA, ano: 2026 }, d);

    expect(dados(r).meses.map((m: any) => m.mes)).toEqual(["2026-01", "2026-02"]);
  });

  it("devolve os doze meses quando pedido", async () => {
    const d = fakeDataSource({ rpc: { kpi_dashboard: [...doisMeses, mesRpc("2026-03")] } });
    const r = await getKpis.run({ company_id: EMPRESA, ano: 2026, incluir_meses_vazios: true }, d);

    expect(dados(r).meses).toHaveLength(3);
  });

  it("o total do ano considera TODOS os meses, mesmo os omitidos da lista", async () => {
    const d = fakeDataSource({
      rpc: { kpi_dashboard: [...doisMeses, mesRpc("2026-03", { net_result: "500.00" })] },
    });
    const r = await getKpis.run({ company_id: EMPRESA, ano: 2026 }, d);

    expect(dados(r).meses).toHaveLength(3);
    expect(dados(r).total_do_ano.resultado_liquido).toBe(800);
  });

  it("avisa que NÃO inclui pendente, ao contrário da DRE em competência", async () => {
    // É a divergência que faria a IA citar dois resultados diferentes para o mesmo
    // mês sem explicar a diferença.
    const r = await getKpis.run({ company_id: EMPRESA, ano: 2026 }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/pending/);
    expect(r.meta.avisos?.join(" ")).toMatch(/get_dre/);
  });

  it("avisa para não somar geração de caixa com as linhas de competência", async () => {
    const r = await getKpis.run({ company_id: EMPRESA, ano: 2026 }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/geracao_de_caixa/);
  });

  it("declara que o consolidado exclui a holding", async () => {
    const d = fakeDataSource({ rpc: { kpi_dashboard_consolidated: doisMeses } });
    const r = await getKpis.run({ organization_id: ORG, ano: 2026 }, d);

    expect(r.meta.como_calculado).toMatch(/EXCLUI a holding/);
  });

  it("exige escopo e ano", async () => {
    await expect(getKpis.run({ ano: 2026 }, ds())).rejects.toThrow(/list_companies/);
    await expect(getKpis.run({ company_id: EMPRESA }, ds())).rejects.toThrow(/quatro dígitos/);
  });
});
