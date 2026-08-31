import { describe, expect, it } from "vitest";

import { fakeDataSource, filtroDe } from "../fixtures.ts";
import { listTaxObligations } from "./taxes.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const obrigacoes = [
  {
    id: "o1",
    company_id: "emp-a",
    kind: "das_simples",
    reference_period: "2026-07-01",
    due_date: "2026-08-20",
    base_amount: "100000.00",
    rate_pct: "6.5",
    amount_estimated: "6500.00",
    amount_paid: "0",
    paid_at: null,
    status: "pending",
    notes: null,
  },
  {
    id: "o2",
    company_id: "emp-a",
    kind: "fgts",
    reference_period: "2026-06-01",
    due_date: "2026-07-07",
    base_amount: "20000.00",
    rate_pct: "8",
    amount_estimated: "1600.00",
    amount_paid: "1650.00",
    paid_at: "2026-07-10",
    status: "paid",
    notes: "pago com multa",
  },
];

describe("list_tax_obligations", () => {
  const ds = () => fakeDataSource({ query: { tax_obligations: obrigacoes } });

  it("agrupa por situação, que é o corte de 'tem imposto atrasado'", async () => {
    const r = await listTaxObligations.run({ company_id: EMPRESA }, ds());

    expect(dados(r).por_situacao).toEqual([
      {
        situacao: "pending",
        obrigacoes: 1,
        valor_estimado: 6500,
        valor_estimado_fmt: "R$ 6.500,00",
        valor_pago: 0,
      },
      {
        situacao: "paid",
        obrigacoes: 1,
        valor_estimado: 1600,
        valor_estimado_fmt: "R$ 1.600,00",
        valor_pago: 1650,
      },
    ]);
  });

  it("mantém estimado e pago separados, porque divergem com multa e juros", async () => {
    const r = await listTaxObligations.run({ company_id: EMPRESA }, ds());

    expect(dados(r).total_estimado).toBe(8100);
    expect(dados(r).total_pago).toBe(1650);
  });

  it("filtra por situação", async () => {
    const d = ds();
    await listTaxObligations.run({ company_id: EMPRESA, situacao: "overdue" }, d);

    expect(filtroDe(d.queries[0], "status", "eq")?.value).toBe("overdue");
  });

  it("filtra por tipo e por janela de vencimento", async () => {
    const d = ds();
    await listTaxObligations.run(
      {
        company_id: EMPRESA,
        tipo: "das_simples",
        vencimento_de: "2026-08-01",
        vencimento_ate: "2026-08-31",
      },
      d,
    );

    expect(filtroDe(d.queries[0], "kind", "eq")?.value).toBe("das_simples");
    expect(filtroDe(d.queries[0], "due_date", "gte")?.value).toBe("2026-08-01");
    expect(filtroDe(d.queries[0], "due_date", "lte")?.value).toBe("2026-08-31");
  });

  it("ordena por vencimento", async () => {
    const d = ds();
    await listTaxObligations.run({ company_id: EMPRESA }, d);

    expect(d.queries[0].order).toEqual({ column: "due_date", ascending: true });
  });

  it("avisa que vazio pode ser falta do módulo, não ausência de imposto", async () => {
    // O módulo é imposto pela RLS: sem ele a consulta devolve zero linhas.
    const d = fakeDataSource({ query: { tax_obligations: [] } });
    const r = await listTaxObligations.run({ company_id: EMPRESA }, d);

    expect(r.meta.avisos?.join(" ")).toMatch(/módulo Impostos/);
  });

  it("explica que competência não é o mês do vencimento", async () => {
    const r = await listTaxObligations.run({ company_id: EMPRESA }, ds());

    expect(r.meta.como_calculado).toMatch(/DAS de julho vence em agosto/);
  });

  it("recusa situação fora do enum", async () => {
    await expect(
      listTaxObligations.run({ company_id: EMPRESA, situacao: "atrasado" }, ds()),
    ).rejects.toThrow(/deve ser um de/);
  });

  it("exige escopo", async () => {
    await expect(listTaxObligations.run({}, ds())).rejects.toThrow(/list_companies/);
  });
});
