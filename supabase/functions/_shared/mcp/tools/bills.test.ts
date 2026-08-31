import { describe, expect, it } from "vitest";

import { fakeDataSource, filtroDe } from "../fixtures.ts";
import { agregarFaixas, getAging, listOpenBills } from "./bills.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const ORG = "99999999-8888-7777-6666-555555555555";
const CONTRAPARTE = "cccccccc-dddd-eeee-ffff-000000000000";

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const faixas = [
  { company_id: "emp-a", direction: "outflow", bucket: "due_31_60", count: 3, total: "300.00" },
  { company_id: "emp-a", direction: "outflow", bucket: "overdue_0_30", count: 2, total: "200.00" },
  { company_id: "emp-a", direction: "outflow", bucket: "no_due_date", count: 1, total: "50.00" },
  { company_id: "emp-a", direction: "inflow", bucket: "due_0_30", count: 4, total: "1000.00" },
];

describe("agregarFaixas", () => {
  it("devolve as faixas em ordem cronológica, do mais vencido ao mais distante", () => {
    const r = agregarFaixas(faixas.filter((f) => f.direction === "outflow") as never);

    expect(r.map((f) => f.faixa)).toEqual(["overdue_0_30", "due_31_60", "no_due_date"]);
  });

  it("omite faixa sem título, para não gastar contexto com zero", () => {
    const r = agregarFaixas(faixas as never);

    expect(r.some((f) => f.titulos === 0)).toBe(false);
  });

  it("soma empresas diferentes na mesma faixa", () => {
    const r = agregarFaixas([
      { company_id: "a", direction: "outflow", bucket: "due_0_30", count: 1, total: "100.00" },
      { company_id: "b", direction: "outflow", bucket: "due_0_30", count: 2, total: "50.00" },
    ] as never);

    expect(r[0]).toMatchObject({ titulos: 3, total: 150 });
  });

  it("marca corretamente o que é vencido", () => {
    const r = agregarFaixas(faixas as never);
    const vencidas = r.filter((f) => f.vencido).map((f) => f.faixa);

    expect(vencidas).toEqual(["overdue_0_30"]);
  });

  it("classifica título sem vencimento como NÃO vencido, mas o mantém no total", () => {
    // Sem data não há atraso; somem do total, porém, seriam R$ 153 mil escondidos.
    const r = agregarFaixas(faixas as never);
    const semData = r.find((f) => f.faixa === "no_due_date");

    expect(semData?.vencido).toBe(false);
    expect(semData?.total).toBe(50);
  });
});

describe("get_aging", () => {
  const ds = () => fakeDataSource({ query: { v_bills_aging: faixas } });

  it("separa a receber de a pagar por padrão", async () => {
    const r = await getAging.run({ company_id: EMPRESA }, ds());

    expect(dados(r).a_receber.total).toBe(1000);
    expect(dados(r).a_pagar.total).toBe(550);
  });

  it("quebra o total em vencido e a vencer", async () => {
    const r = await getAging.run({ company_id: EMPRESA }, ds());

    expect(dados(r).a_pagar).toMatchObject({ vencido: 200, a_vencer: 350 });
  });

  it("filtra a direção quando pedida", async () => {
    const d = ds();
    const r = await getAging.run({ company_id: EMPRESA, direcao: "a_pagar" }, d);

    expect(dados(r).a_receber).toBeUndefined();
    expect(filtroDe(d.queries[0], "direction", "eq")?.value).toBe("outflow");
  });

  it("consolida por organização via lista de empresas", async () => {
    const d = fakeDataSource({
      query: {
        companies: [
          { id: "emp-a", organization_id: ORG },
          { id: "emp-b", organization_id: ORG },
        ],
        v_bills_aging: faixas,
      },
    });

    await getAging.run({ organization_id: ORG }, d);

    expect(filtroDe(d.queries[1], "company_id", "in")?.value).toEqual(["emp-a", "emp-b"]);
  });

  it("avisa que 'a vencer' inclui recorrência futura, não inadimplência", async () => {
    const r = await getAging.run({ company_id: EMPRESA }, ds());

    expect(r.meta.avisos?.join(" ")).toMatch(/recorrência/i);
    expect(r.meta.avisos?.join(" ")).toMatch(/inadimplência/i);
  });

  it("exige escopo", async () => {
    await expect(getAging.run({}, ds())).rejects.toThrow(/list_companies/);
  });
});

describe("list_open_bills", () => {
  const titulos = [
    {
      id: "t1",
      company_id: "emp-a",
      direction: "outflow",
      status: "pending",
      effective_status: "overdue",
      amount: "1000.00",
      paid_amount: "200.00",
      open_amount: "800.00",
      due_date: "2026-07-01",
      days_overdue: 30,
      accrual_date: "2026-06-01",
      description: "Fornecedor X",
      document_ref: "NF 9",
      installment_n: 2,
      installment_total: 3,
      pagarme_projection_key: null,
      counterparties: { name: "Fornecedor X" },
      chart_of_accounts: { code: "4.1.01", name: "Serviços" },
    },
    {
      id: "t2",
      company_id: "emp-a",
      direction: "inflow",
      status: "scheduled",
      effective_status: "open",
      amount: "500.00",
      paid_amount: "0",
      open_amount: "500.00",
      due_date: "2026-09-15",
      days_overdue: -45,
      accrual_date: "2026-09-01",
      description: "Mensalidade",
      document_ref: null,
      installment_n: null,
      installment_total: null,
      pagarme_projection_key: "pgm-2026-09-15",
      counterparties: null,
      chart_of_accounts: { code: "3.1.01", name: "Receita" },
    },
  ];
  const ds = () => fakeDataSource({ query: { v_bills: titulos } });

  it("só busca o que está em aberto", async () => {
    const d = ds();
    await listOpenBills.run({ company_id: EMPRESA }, d);

    expect(filtroDe(d.queries[0], "effective_status", "in")?.value).toEqual([
      "open",
      "partial",
      "overdue",
    ]);
  });

  it("separa dias de atraso de dias para vencer", async () => {
    const r = await listOpenBills.run({ company_id: EMPRESA }, ds());

    expect(dados(r).titulos[0]).toMatchObject({ dias_de_atraso: 30, dias_para_vencer: null });
    expect(dados(r).titulos[1]).toMatchObject({ dias_de_atraso: null, dias_para_vencer: 45 });
  });

  it("usa o valor ABERTO, não o original, no total", async () => {
    const r = await listOpenBills.run({ company_id: EMPRESA }, ds());

    expect(dados(r).total_aberto).toBe(1300);
  });

  it("identifica a origem pela chave de projeção", async () => {
    const r = await listOpenBills.run({ company_id: EMPRESA }, ds());

    expect(dados(r).titulos.map((t: any) => t.origem)).toEqual(["manual", "pagarme"]);
  });

  it("formata a parcela quando existe", async () => {
    const r = await listOpenBills.run({ company_id: EMPRESA }, ds());

    expect(dados(r).titulos[0].parcela).toBe("2/3");
    expect(dados(r).titulos[1].parcela).toBeNull();
  });

  it("filtra por origem pagarme com not_is na chave de projeção", async () => {
    const d = ds();
    await listOpenBills.run({ company_id: EMPRESA, origem: "pagarme" }, d);

    expect(filtroDe(d.queries[0], "pagarme_projection_key", "not_is")).toBeDefined();
  });

  it("filtra por origem manual com is null", async () => {
    const d = ds();
    await listOpenBills.run({ company_id: EMPRESA, origem: "manual" }, d);

    expect(filtroDe(d.queries[0], "pagarme_projection_key", "is")?.value).toBeNull();
  });

  it("apenas_vencidos estreita para overdue", async () => {
    const d = ds();
    await listOpenBills.run({ company_id: EMPRESA, apenas_vencidos: true }, d);

    expect(filtroDe(d.queries[0], "effective_status", "eq")?.value).toBe("overdue");
  });

  it("filtra por contraparte e vencimento", async () => {
    const d = ds();
    await listOpenBills.run(
      {
        company_id: EMPRESA,
        counterparty_id: CONTRAPARTE,
        vencimento_de: "2026-07-01",
        vencimento_ate: "2026-07-31",
      },
      d,
    );

    expect(filtroDe(d.queries[0], "counterparty_id", "eq")?.value).toBe(CONTRAPARTE);
    expect(filtroDe(d.queries[0], "due_date", "gte")?.value).toBe("2026-07-01");
    expect(filtroDe(d.queries[0], "due_date", "lte")?.value).toBe("2026-07-31");
  });

  it("ordena por vencimento crescente por padrão", async () => {
    const d = ds();
    await listOpenBills.run({ company_id: EMPRESA }, d);

    expect(d.queries[0].order).toEqual({ column: "due_date", ascending: true });
  });

  it("ordena por valor decrescente quando pedido", async () => {
    const d = ds();
    await listOpenBills.run({ company_id: EMPRESA, ordenar_por: "valor" }, d);

    expect(d.queries[0].order).toEqual({ column: "open_amount", ascending: false });
  });

  it("usa dica de foreign key nos embeds, porque v_bills é view sobre transactions", async () => {
    const d = ds();
    await listOpenBills.run({ company_id: EMPRESA }, d);

    expect(d.queries[0].columns).toContain("counterparties!transactions_counterparty_id_fkey");
    expect(d.queries[0].columns).not.toContain("*");
  });

  it("avisa que o total não é o da carteira quando trunca", async () => {
    const d = ds();
    const r = await listOpenBills.run({ company_id: EMPRESA, limite: 2 }, d);

    expect(r.meta.avisos?.join(" ")).toMatch(/truncado/i);
    expect(r.meta.como_calculado).toMatch(/get_aging/);
  });
});
