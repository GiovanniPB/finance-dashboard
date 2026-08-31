import { describe, expect, it } from "vitest";

import { fakeDataSource, filtroDe } from "../fixtures.ts";
import { payrollSummary } from "./payroll.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const fechamentos = [
  {
    id: "p1",
    company_id: "emp-a",
    reference_month: "2026-07-01",
    status: "posted",
    total_fixed: "50000.00",
    total_variable: "10000.00",
    total_benefits: "8000.00",
    total_charges: "18000.00",
    posted_at: "2026-08-05T10:00:00Z",
    notes: null,
  },
  {
    id: "p2",
    company_id: "emp-a",
    reference_month: "2026-06-01",
    status: "draft",
    total_fixed: "48000.00",
    total_variable: "0",
    total_benefits: "8000.00",
    total_charges: "17000.00",
    posted_at: null,
    notes: "em conferência",
  },
];

describe("payroll_summary", () => {
  const ds = () => fakeDataSource({ query: { payroll_runs: fechamentos } });

  it("soma o custo total de cada fechamento", async () => {
    const r = await payrollSummary.run({ company_id: EMPRESA }, ds());

    expect(dados(r).fechamentos[0].custo_total).toBe(86000);
    expect(dados(r).total_do_periodo.custo_total).toBe(159000);
  });

  it("calcula o peso dos encargos sobre a remuneração", async () => {
    // 18000 / (50000 + 10000) = 30%.
    const r = await payrollSummary.run({ company_id: EMPRESA }, ds());

    expect(dados(r).fechamentos[0].peso_dos_encargos_pct).toBe(30);
  });

  it("reduz o mês de referência a AAAA-MM", async () => {
    const r = await payrollSummary.run({ company_id: EMPRESA }, ds());

    expect(dados(r).fechamentos.map((f: any) => f.mes_de_referencia)).toEqual([
      "2026-07",
      "2026-06",
    ]);
  });

  it("NÃO consulta dado individual de funcionário", async () => {
    // Decisão de privacidade: o servidor não expõe salário por pessoa.
    const d = ds();
    await payrollSummary.run({ company_id: EMPRESA }, d);

    expect(d.queries.map((q) => q.table)).toEqual(["payroll_runs"]);
    expect(d.queries[0].columns).not.toContain("employee");
  });

  it("expande AAAA-MM para o primeiro dia na consulta", async () => {
    const d = ds();
    await payrollSummary.run({ company_id: EMPRESA, mes_de: "2026-01", mes_ate: "2026-07" }, d);

    expect(filtroDe(d.queries[0], "reference_month", "gte")?.value).toBe("2026-01-01");
    expect(filtroDe(d.queries[0], "reference_month", "lte")?.value).toBe("2026-07-01");
  });

  it("recusa mês em formato de data completa", async () => {
    await expect(
      payrollSummary.run({ company_id: EMPRESA, mes_de: "2026-01-01" }, ds()),
    ).rejects.toThrow(/AAAA-MM/);
  });

  it("filtra por situação", async () => {
    const d = ds();
    await payrollSummary.run({ company_id: EMPRESA, situacao: "posted" }, d);

    expect(filtroDe(d.queries[0], "status", "eq")?.value).toBe("posted");
  });

  it("avisa que folha não lançada não aparece na DRE", async () => {
    // É a divergência que explicaria "a folha custou X mas a despesa de pessoal é Y".
    const r = await payrollSummary.run({ company_id: EMPRESA }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/NÃO foram lançados/);
  });

  it("não avisa quando todos os fechamentos estão lançados", async () => {
    const d = fakeDataSource({ query: { payroll_runs: [fechamentos[0]] } });
    const r = await payrollSummary.run({ company_id: EMPRESA }, d);

    expect(r.meta.avisos?.join(" ")).not.toMatch(/NÃO foram lançados/);
  });

  it("avisa que vazio pode ser falta do módulo", async () => {
    const d = fakeDataSource({ query: { payroll_runs: [] } });
    const r = await payrollSummary.run({ company_id: EMPRESA }, d);

    expect(r.meta.avisos?.join(" ")).toMatch(/módulo Folha/);
  });

  it("declara na descrição que não devolve dado individual", async () => {
    expect(payrollSummary.description).toMatch(/NÃO devolve dado individual/);
  });

  it("devolve peso nulo quando não houve remuneração", async () => {
    const d = fakeDataSource({
      query: {
        payroll_runs: [
          {
            ...fechamentos[0],
            total_fixed: "0",
            total_variable: "0",
            total_charges: "0",
            total_benefits: "0",
          },
        ],
      },
    });

    const r = await payrollSummary.run({ company_id: EMPRESA }, d);

    expect(dados(r).fechamentos[0].peso_dos_encargos_pct).toBeNull();
  });

  it("exige escopo", async () => {
    await expect(payrollSummary.run({}, ds())).rejects.toThrow(/list_companies/);
  });
});
