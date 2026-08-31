import { describe, expect, it } from "vitest";

import { fakeDataSource, filtroDe } from "../fixtures.ts";
import {
  AGREGADO_MAX,
  agregarPorConta,
  LINHAS_MAX,
  searchTransactions,
  valorComSinal,
} from "./transactions.ts";

const COMPANY = "11111111-2222-3333-4444-555555555555";
const periodo = { from: "2026-07-01", to: "2026-07-31" };

const linhas = [
  {
    id: "a",
    accrual_date: "2026-07-05",
    cash_date: "2026-07-05",
    amount: "10000.00",
    direction: "inflow",
    status: "settled",
    description: "Mensalidade assessoria",
    document_ref: null,
    transfer_group_id: null,
    chart_of_accounts: { code: "3.1", name: "Receita de serviços", kind: "revenue" },
    cost_centers: null,
    counterparties: { name: "Cliente X", document: "123.456.789-09" },
  },
  {
    id: "b",
    accrual_date: "2026-07-10",
    cash_date: null,
    amount: "2500.00",
    direction: "outflow",
    status: "pending",
    description: "Aluguel",
    document_ref: "NF 12",
    transfer_group_id: null,
    chart_of_accounts: { code: "4.1", name: "Aluguel", kind: "operating_expense" },
    cost_centers: { name: "Administrativo" },
    counterparties: { name: "Imobiliária Y", document: "12345678000199" },
  },
  {
    id: "c",
    accrual_date: "2026-07-20",
    cash_date: "2026-07-20",
    amount: "1500.00",
    direction: "outflow",
    status: "settled",
    description: "Aluguel estacionamento",
    document_ref: null,
    transfer_group_id: null,
    chart_of_accounts: { code: "4.1", name: "Aluguel", kind: "operating_expense" },
    cost_centers: null,
    counterparties: null,
  },
];

const ds = () => fakeDataSource({ query: { transactions: linhas } });

describe("valorComSinal", () => {
  it("entrada é positiva e saída é negativa", () => {
    expect(valorComSinal({ amount: "100", direction: "inflow" })).toBe(100);
    expect(valorComSinal({ amount: "100", direction: "outflow" })).toBe(-100);
  });
});

describe("agregarPorConta", () => {
  it("soma entradas e saídas separadamente e o líquido com sinal", () => {
    const grupos = agregarPorConta(linhas as never);
    const aluguel = grupos.find((g) => g.conta_codigo === "4.1");
    expect(aluguel).toMatchObject({ lancamentos: 2, entradas: 0, saidas: 4000, liquido: -4000 });
  });

  it("ordena pelo maior impacto absoluto", () => {
    expect(agregarPorConta(linhas as never)[0].conta_codigo).toBe("3.1");
  });

  it("não perde lançamento sem conta", () => {
    const grupos = agregarPorConta([{ ...linhas[0], chart_of_accounts: null }] as never);
    expect(grupos[0].conta_codigo).toBe("(sem conta)");
  });
});

describe("search_transactions — semântica dos filtros", () => {
  it("competência filtra por accrual_date e inclui pendente", async () => {
    const fake = ds();
    await searchTransactions.run({ company_id: COMPANY, ...periodo }, fake);
    const q = fake.queries[0];
    expect(filtroDe(q, "accrual_date", "gte")?.value).toBe("2026-07-01");
    expect(filtroDe(q, "status", "in")?.value).toContain("pending");
  });

  it("caixa filtra por cash_date e NÃO inclui pendente", async () => {
    const fake = ds();
    await searchTransactions.run({ company_id: COMPANY, ...periodo, campo_data: "caixa" }, fake);
    const q = fake.queries[0];
    expect(filtroDe(q, "cash_date", "gte")?.value).toBe("2026-07-01");
    expect(filtroDe(q, "accrual_date")).toBeUndefined();
    expect(filtroDe(q, "status", "in")?.value).not.toContain("pending");
  });

  it("exclui transferência entre contas por padrão", async () => {
    const fake = ds();
    await searchTransactions.run({ company_id: COMPANY, ...periodo }, fake);
    expect(filtroDe(fake.queries[0], "transfer_group_id", "is")).toBeDefined();
  });

  it("inclui transferência só quando pedido explicitamente", async () => {
    const fake = ds();
    await searchTransactions.run(
      { company_id: COMPANY, ...periodo, incluir_transferencias: true },
      fake,
    );
    expect(filtroDe(fake.queries[0], "transfer_group_id")).toBeUndefined();
  });

  it("nunca busca lançamento apagado", async () => {
    const fake = ds();
    await searchTransactions.run({ company_id: COMPANY, ...periodo }, fake);
    expect(filtroDe(fake.queries[0], "deleted_at", "is")).toBeDefined();
  });

  it("traduz direção para o enum do banco", async () => {
    const fake = ds();
    await searchTransactions.run({ company_id: COMPANY, ...periodo, direcao: "saida" }, fake);
    expect(filtroDe(fake.queries[0], "direction", "eq")?.value).toBe("outflow");
  });

  it("busca textual vira ilike com curingas", async () => {
    const fake = ds();
    await searchTransactions.run({ company_id: COMPANY, ...periodo, texto: "aluguel" }, fake);
    expect(filtroDe(fake.queries[0], "description", "ilike")?.value).toBe("%aluguel%");
  });
});

describe("search_transactions — formato", () => {
  it("agrega por conta por padrão, sem devolver as linhas", async () => {
    const r = await searchTransactions.run({ company_id: COMPANY, ...periodo }, ds());
    const dados = r.dados as { por_conta: unknown[]; total_liquido: number; lancamentos: number };
    expect(dados.por_conta).toHaveLength(2);
    expect(dados.total_liquido).toBe(6000);
    expect(dados.lancamentos).toBe(3);
    expect(r.dados).not.toHaveProperty("lancamentos.0.descricao");
  });

  it("usa o teto de agregação, não o limite de linhas", async () => {
    const fake = ds();
    await searchTransactions.run({ company_id: COMPANY, ...periodo, limite: 10 }, fake);
    expect(fake.queries[0].limit).toBe(AGREGADO_MAX);
  });

  it("no formato linhas, mascara CPF e preserva CNPJ", async () => {
    const r = await searchTransactions.run(
      { company_id: COMPANY, ...periodo, formato: "linhas" },
      ds(),
    );
    const l = (r.dados as { lancamentos: { contraparte_documento: string | null }[] }).lancamentos;
    expect(l[0].contraparte_documento).toBe("***.456.789-**");
    expect(l[1].contraparte_documento).toBe("12.345.678/0001-99");
  });

  it("corta o limite pedido no teto", async () => {
    const fake = ds();
    await searchTransactions.run(
      { company_id: COMPANY, ...periodo, formato: "linhas", limite: 9999 },
      fake,
    );
    expect(fake.queries[0].limit).toBe(LINHAS_MAX);
  });

  it("avisa quando o resultado bateu no teto — silêncio aqui vira total errado", async () => {
    const cheio = Array.from({ length: 3 }, (_, i) => ({ ...linhas[0], id: String(i) }));
    const fake = fakeDataSource({ query: { transactions: cheio } });
    const r = await searchTransactions.run(
      { company_id: COMPANY, ...periodo, formato: "linhas", limite: 3 },
      fake,
    );
    expect(r.meta.avisos?.[0]).toMatch(/truncado em 3 linhas/);
  });

  it("não avisa quando veio menos que o teto", async () => {
    const r = await searchTransactions.run(
      { company_id: COMPANY, ...periodo, formato: "linhas" },
      ds(),
    );
    expect(r.meta.avisos).toBeUndefined();
  });
});
