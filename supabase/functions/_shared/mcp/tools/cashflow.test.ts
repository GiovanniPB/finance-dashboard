import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { agregarPorMes, getCashflow, mesDe } from "./cashflow.ts";

const COMPANY = "11111111-2222-3333-4444-555555555555";

const dias = [
  { day: "2026-07-01", inflow: "1000.00", outflow: "200.00", net: "800.00" },
  { day: "2026-07-15", inflow: "500.00", outflow: "0", net: "500.00" },
  { day: "2026-08-02", inflow: "0", outflow: "300.00", net: "-300.00" },
];

const ds = () => fakeDataSource({ rpc: { cashflow_daily: dias } });
const periodo = { from: "2026-07-01", to: "2026-08-31" };

describe("agregarPorMes", () => {
  it("soma os dias dentro de cada mês", () => {
    const r = agregarPorMes([
      { periodo: "2026-07-01", entradas: 10, saidas: 1, liquido: 9 },
      { periodo: "2026-07-20", entradas: 5, saidas: 2, liquido: 3 },
    ]);
    expect(r).toEqual([{ periodo: "2026-07", entradas: 15, saidas: 3, liquido: 12 }]);
  });

  it("mantém a ordem cronológica mesmo com entrada fora de ordem", () => {
    const r = agregarPorMes([
      { periodo: "2026-09-01", entradas: 1, saidas: 0, liquido: 1 },
      { periodo: "2026-07-01", entradas: 1, saidas: 0, liquido: 1 },
    ]);
    expect(r.map((p) => p.periodo)).toEqual(["2026-07", "2026-09"]);
  });

  it("não acumula erro de ponto flutuante", () => {
    const r = agregarPorMes([
      { periodo: "2026-07-01", entradas: 0.1, saidas: 0, liquido: 0.1 },
      { periodo: "2026-07-02", entradas: 0.2, saidas: 0, liquido: 0.2 },
    ]);
    expect(r[0].entradas).toBe(0.3);
  });
});

describe("mesDe", () => {
  it("extrai AAAA-MM", () => {
    expect(mesDe("2026-07-15")).toBe("2026-07");
  });
});

describe("get_cashflow", () => {
  it("agrupa por mês por padrão", async () => {
    const r = await getCashflow.run({ company_id: COMPANY, ...periodo }, ds());
    expect((r.dados as any).serie.map((p: any) => p.periodo)).toEqual(["2026-07", "2026-08"]);
  });

  it("devolve o diário quando pedido", async () => {
    const r = await getCashflow.run(
      { company_id: COMPANY, ...periodo, granularidade: "diario" },
      ds(),
    );
    expect((r.dados as any).serie).toHaveLength(3);
  });

  it("soma os totais do período", async () => {
    const r = await getCashflow.run({ company_id: COMPANY, ...periodo }, ds());
    expect((r.dados as any).totais).toMatchObject({ entradas: 1500, saidas: 500, liquido: 1000 });
  });

  it("é sempre regime de caixa, sem opção de competência", async () => {
    const r = await getCashflow.run({ company_id: COMPANY, ...periodo }, ds());
    expect(r.meta.regime).toBe("caixa");
    expect(r.meta.status_incluidos).toEqual(["settled", "reconciled"]);
  });

  it("exige a empresa", async () => {
    await expect(getCashflow.run(periodo, ds())).rejects.toThrow(/list_companies/);
  });
});
