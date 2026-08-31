import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { getDre } from "./dre.ts";

const COMPANY = "11111111-2222-3333-4444-555555555555";
const ORG = "99999999-8888-7777-6666-555555555555";

/** Receita com competência e caixa DIFERENTES — é o caso que separa os dois regimes. */
const linhas = [
  {
    code: "3.1",
    name: "Receita de serviços",
    kind: "revenue",
    dre_section: "gross_revenue",
    is_summary: false,
    below_the_line: false,
    sort_order: 1,
    total: "100000.00",
    total_cash: "60000.00",
  },
  {
    code: "4.1",
    name: "Aluguel",
    kind: "operating_expense",
    dre_section: "fixed_costs",
    is_summary: false,
    below_the_line: false,
    sort_order: 2,
    total: "-8000.00",
    total_cash: "-8000.00",
  },
  {
    code: "4.9",
    name: "Conta sem movimento",
    kind: "operating_expense",
    dre_section: "fixed_costs",
    is_summary: false,
    below_the_line: false,
    sort_order: 3,
    total: "0",
    total_cash: "0",
  },
  {
    code: "9.9",
    name: "= Resultado líquido",
    kind: "summary",
    dre_section: "net_result",
    is_summary: true,
    below_the_line: false,
    sort_order: 9,
    total: "92000.00",
    total_cash: "52000.00",
  },
];

const ds = () => fakeDataSource({ rpc: { dre_by_company: linhas, dre_consolidated: linhas } });
const periodo = { from: "2026-07-01", to: "2026-07-31" };

interface DreDados {
  linhas: { codigo: string; valor: number; valor_fmt: string }[];
  resumo: unknown[];
}

describe("get_dre", () => {
  it("usa a coluna de competência por padrão", async () => {
    const r = await getDre.run({ company_id: COMPANY, ...periodo }, ds());
    const receita = (r.dados as DreDados).linhas.find((l) => l.codigo === "3.1");
    expect(receita?.valor).toBe(100000);
    expect(r.meta.regime).toBe("competencia");
  });

  it("usa a coluna de caixa quando o regime é caixa", async () => {
    const r = await getDre.run({ company_id: COMPANY, ...periodo, regime: "caixa" }, ds());
    const receita = (r.dados as DreDados).linhas.find((l) => l.codigo === "3.1");
    expect(receita?.valor).toBe(60000);
  });

  it("declara na proveniência que competência inclui pendente e caixa não", async () => {
    const comp = await getDre.run({ company_id: COMPANY, ...periodo }, ds());
    const caixa = await getDre.run({ company_id: COMPANY, ...periodo, regime: "caixa" }, ds());
    expect(comp.meta.status_incluidos).toContain("pending");
    expect(caixa.meta.status_incluidos).not.toContain("pending");
  });

  it("omite conta zerada mas nunca a totalizadora", async () => {
    const r = await getDre.run({ company_id: COMPANY, ...periodo }, ds());
    const codigos = (r.dados as DreDados).linhas.map((l) => l.codigo);
    expect(codigos).not.toContain("4.9");
    expect(codigos).toContain("9.9");
    expect((r.dados as DreDados).resumo).toHaveLength(1);
  });

  it("inclui zerados quando pedido explicitamente", async () => {
    const r = await getDre.run({ company_id: COMPANY, ...periodo, incluir_zerados: true }, ds());
    expect((r.dados as DreDados).linhas.map((l) => l.codigo)).toContain("4.9");
  });

  it("chama a RPC consolidada quando o escopo é a organização", async () => {
    const fake = ds();
    await getDre.run({ organization_id: ORG, ...periodo }, fake);
    expect(fake.rpcCalls[0].fn).toBe("dre_consolidated");
    expect(fake.rpcCalls[0].args.p_organization_id).toBe(ORG);
  });

  it("recusa período ausente em vez de assumir o mês corrente", async () => {
    await expect(getDre.run({ company_id: COMPANY }, ds())).rejects.toThrow(/"from" é obrigatório/);
  });

  it("formata o valor em BRL junto do número", async () => {
    const r = await getDre.run({ company_id: COMPANY, ...periodo }, ds());
    const receita = (r.dados as DreDados).linhas.find((l) => l.codigo === "3.1");
    expect(receita?.valor_fmt).toBe("R$ 100.000,00");
  });
});
