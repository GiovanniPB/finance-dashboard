import { describe, expect, it } from "vitest";

import { fakeDataSource, filtroDe } from "../fixtures.ts";
import { listDimensions } from "./dimensions.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const ORG = "99999999-8888-7777-6666-555555555555";

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

describe("list_dimensions — contas", () => {
  it("devolve o código que search_transactions aceita em conta_codigo", async () => {
    const ds = fakeDataSource({
      query: {
        chart_of_accounts: [
          {
            code: "3.1.01",
            name: "Receita de serviços",
            kind: "revenue",
            dre_section: "gross_revenue",
            is_summary: false,
            below_the_line: false,
            is_active: true,
          },
        ],
      },
    });

    const r = await listDimensions.run({ tipo: "contas", company_id: EMPRESA }, ds);

    expect(dados(r).contas[0]).toMatchObject({ codigo: "3.1.01", conta: "Receita de serviços" });
  });

  it("filtra pela empresa e por ativas por padrão", async () => {
    const ds = fakeDataSource({ query: { chart_of_accounts: [] } });
    await listDimensions.run({ tipo: "contas", company_id: EMPRESA }, ds);

    expect(filtroDe(ds.queries[0], "company_id", "eq")?.value).toBe(EMPRESA);
    expect(filtroDe(ds.queries[0], "is_active", "eq")?.value).toBe(true);
  });

  it("inclui inativas quando pedido", async () => {
    const ds = fakeDataSource({ query: { chart_of_accounts: [] } });
    await listDimensions.run({ tipo: "contas", company_id: EMPRESA, apenas_ativos: false }, ds);

    expect(filtroDe(ds.queries[0], "is_active")).toBeUndefined();
  });

  it("exige a empresa", async () => {
    await expect(listDimensions.run({ tipo: "contas" }, fakeDataSource())).rejects.toThrow(
      /company_id/,
    );
  });
});

describe("list_dimensions — contrapartes", () => {
  it("busca pela ORGANIZAÇÃO, não pela empresa", async () => {
    // Contraparte é da organização: o mesmo fornecedor atende várias empresas do
    // grupo. Filtrar por company_id devolveria vazio sempre.
    const ds = fakeDataSource({ query: { counterparties: [] } });
    await listDimensions.run({ tipo: "contrapartes", organization_id: ORG }, ds);

    expect(filtroDe(ds.queries[0], "organization_id", "eq")?.value).toBe(ORG);
    expect(ds.queries[0].table).toBe("counterparties");
  });

  it("deduz a organização a partir da empresa quando só ela é informada", async () => {
    const ds = fakeDataSource({
      query: {
        companies: [{ id: EMPRESA, organization_id: ORG }],
        counterparties: [],
      },
    });

    await listDimensions.run({ tipo: "contrapartes", company_id: EMPRESA }, ds);

    expect(ds.queries[0].table).toBe("companies");
    expect(filtroDe(ds.queries[1], "organization_id", "eq")?.value).toBe(ORG);
  });

  it("mascara CPF e preserva CNPJ", async () => {
    const ds = fakeDataSource({
      query: {
        counterparties: [
          {
            id: "c1",
            name: "Pessoa Física",
            kind: "customer",
            document: "12345678901",
            is_active: true,
          },
          {
            id: "c2",
            name: "Empresa LTDA",
            kind: "supplier",
            document: "12345678000199",
            is_active: true,
          },
        ],
      },
    });

    const r = await listDimensions.run({ tipo: "contrapartes", organization_id: ORG }, ds);

    expect(dados(r).contrapartes[0].documento).toBe("***.456.789-**");
    expect(dados(r).contrapartes[1].documento).toBe("12.345.678/0001-99");
  });

  it("recusa quando não dá para saber a organização", async () => {
    await expect(listDimensions.run({ tipo: "contrapartes" }, fakeDataSource())).rejects.toThrow(
      /organization_id/,
    );
  });

  it("recusa empresa inexistente ou sem permissão em vez de listar a organização errada", async () => {
    const ds = fakeDataSource({ query: { companies: [] } });

    await expect(
      listDimensions.run({ tipo: "contrapartes", company_id: EMPRESA }, ds),
    ).rejects.toThrow(/list_companies/);
  });
});

describe("list_dimensions — contas bancárias e do pagar.me", () => {
  it("devolve o bank_account_id que get_account_ledger exige", async () => {
    const ds = fakeDataSource({
      query: {
        bank_accounts: [
          {
            id: "banco-1",
            bank_name: "Itaú",
            nickname: "Conta movimento",
            account_type: "checking",
            is_active: true,
          },
        ],
      },
    });

    const r = await listDimensions.run({ tipo: "contas_bancarias", company_id: EMPRESA }, ds);

    expect(dados(r).contas_bancarias[0]).toMatchObject({
      bank_account_id: "banco-1",
      apelido: "Conta movimento",
    });
  });

  it("contas do pagar.me vêm de RPC, com a data de corte", async () => {
    const ds = fakeDataSource({
      rpc: {
        pagarme_gateway_accounts: [
          {
            pagarme_account_id: "pgm-1",
            account_label: "RCO",
            gateway_nickname: "pagar.me RCO",
            payout_nickname: "Itaú",
            cutover_date: "2026-01-01",
            enabled: true,
          },
        ],
      },
    });

    const r = await listDimensions.run({ tipo: "contas_pagarme", company_id: EMPRESA }, ds);

    expect(ds.rpcCalls[0]).toEqual({
      fn: "pagarme_gateway_accounts",
      args: { p_company_id: EMPRESA },
    });
    expect(dados(r).contas_pagarme[0]).toMatchObject({
      pagarme_account_id: "pgm-1",
      data_de_corte: "2026-01-01",
    });
  });
});

describe("list_dimensions — contrato geral", () => {
  it("recusa tipo desconhecido", async () => {
    await expect(
      listDimensions.run({ tipo: "bancos", company_id: EMPRESA }, fakeDataSource()),
    ).rejects.toThrow(/deve ser um de/);
  });

  it("nunca pede '*' ao banco", async () => {
    const ds = fakeDataSource({ query: { chart_of_accounts: [] } });
    await listDimensions.run({ tipo: "contas", company_id: EMPRESA }, ds);

    expect(ds.queries[0].columns).not.toContain("*");
  });

  it("avisa quando o resultado bate no teto", async () => {
    const muitas = Array.from({ length: 5 }, (_, i) => ({
      code: `3.1.0${i}`,
      name: `Conta ${i}`,
      kind: "revenue",
      dre_section: null,
      is_summary: false,
      below_the_line: false,
      is_active: true,
    }));
    const ds = fakeDataSource({ query: { chart_of_accounts: muitas } });

    const r = await listDimensions.run({ tipo: "contas", company_id: EMPRESA, limite: 5 }, ds);

    expect(r.meta.avisos?.join(" ")).toMatch(/truncado/i);
  });
});
