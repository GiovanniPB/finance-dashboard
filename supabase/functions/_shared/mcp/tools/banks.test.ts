import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { getAccountLedger, getBankBalances, hojeISO } from "./banks.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const ORG = "99999999-8888-7777-6666-555555555555";
const CONTA = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const saldos = [
  {
    company_id: "emp-a",
    company_name: "OTM Assessoria",
    bank_account_id: "b1",
    bank_name: "Itaú",
    nickname: "Movimento",
    account_type: "checking",
    initial_balance: "1000.00",
    inflow: "500.00",
    outflow: "200.00",
    closing_balance: "1300.00",
  },
  {
    company_id: "emp-a",
    company_name: "OTM Assessoria",
    bank_account_id: "b2",
    bank_name: "Itaú",
    nickname: "Aplicação",
    account_type: "cdb_daily",
    initial_balance: "0",
    inflow: "700.00",
    outflow: "0",
    closing_balance: "700.00",
  },
  {
    company_id: "emp-b",
    company_name: "OTM Corretora",
    bank_account_id: "b3",
    bank_name: "BB",
    nickname: "Movimento",
    account_type: "checking",
    initial_balance: "0",
    inflow: "0",
    outflow: "50.00",
    closing_balance: "-50.00",
  },
];

describe("hojeISO", () => {
  it("formata em AAAA-MM-DD", () => {
    expect(hojeISO(new Date("2026-07-15T18:30:00Z"))).toBe("2026-07-15");
  });
});

describe("get_bank_balances", () => {
  it("soma o total e também por empresa", async () => {
    const ds = fakeDataSource({ rpc: { bank_balances_multi: saldos } });

    const r = await getBankBalances.run({ company_id: EMPRESA, data_referencia: "2026-07-31" }, ds);

    expect(dados(r).total).toBe(1950);
    expect(dados(r).por_empresa).toEqual([
      { company_id: "emp-a", empresa: "OTM Assessoria", saldo: 2000, saldo_fmt: "R$ 2.000,00" },
      { company_id: "emp-b", empresa: "OTM Corretora", saldo: -50, saldo_fmt: "-R$ 50,00" },
    ]);
  });

  it("passa a data e a lista de empresas para a RPC", async () => {
    const ds = fakeDataSource({ rpc: { bank_balances_multi: [] } });
    await getBankBalances.run({ company_id: EMPRESA, data_referencia: "2026-07-31" }, ds);

    expect(ds.rpcCalls[0]).toEqual({
      fn: "bank_balances_multi",
      args: { p_as_of: "2026-07-31", p_company_ids: [EMPRESA] },
    });
  });

  it("no consolidado resolve as empresas da organização primeiro", async () => {
    const ds = fakeDataSource({
      query: {
        companies: [
          { id: "emp-a", organization_id: ORG },
          { id: "emp-b", organization_id: ORG },
        ],
      },
      rpc: { bank_balances_multi: saldos },
    });

    await getBankBalances.run({ organization_id: ORG, data_referencia: "2026-07-31" }, ds);

    expect(ds.rpcCalls[0].args.p_company_ids).toEqual(["emp-a", "emp-b"]);
  });

  it("usa hoje quando a data não vem, e DECLARA que usou", async () => {
    // Default declarado, não silencioso: é a única exceção à regra de nenhum
    // parâmetro implícito, e ela só se sustenta se a resposta disser a data.
    const ds = fakeDataSource({ rpc: { bank_balances_multi: [] } });

    const r = await getBankBalances.run({ company_id: EMPRESA }, ds);

    expect(dados(r).data_referencia).toBe(hojeISO());
    expect(r.meta.avisos?.join(" ")).toMatch(/não informada/i);
  });

  it("não avisa sobre a data quando ela foi informada", async () => {
    const ds = fakeDataSource({ rpc: { bank_balances_multi: [] } });
    const r = await getBankBalances.run({ company_id: EMPRESA, data_referencia: "2026-07-31" }, ds);

    expect(r.meta.avisos?.join(" ")).not.toMatch(/não informada/i);
  });

  it("avisa que saldo conta só settled, e o fluxo de caixa também reconciled", async () => {
    // A divergência é latente hoje (não há linha reconciled), e é justamente por
    // isso que precisa estar escrita: quando aparecer, ninguém vai lembrar.
    const ds = fakeDataSource({ rpc: { bank_balances_multi: [] } });
    const r = await getBankBalances.run({ company_id: EMPRESA, data_referencia: "2026-07-31" }, ds);

    expect(r.meta.avisos?.join(" ")).toMatch(/settled/);
    expect(r.meta.avisos?.join(" ")).toMatch(/reconciled/);
  });

  it("exige escopo", async () => {
    await expect(getBankBalances.run({}, fakeDataSource())).rejects.toThrow(/list_companies/);
  });

  it("recusa data inválida", async () => {
    await expect(
      getBankBalances.run({ company_id: EMPRESA, data_referencia: "31/07/2026" }, fakeDataSource()),
    ).rejects.toThrow(/AAAA-MM-DD/);
  });
});

describe("get_account_ledger", () => {
  const resumo = [
    { opening_balance: "1000.00", inflow: "500.00", outflow: "200.00", closing_balance: "1300.00" },
  ];
  const extrato = [
    {
      transaction_id: "t1",
      cash_date: "2026-07-02",
      description: "Recebimento cliente",
      direction: "inflow",
      amount: "500.00",
      signed_amount: "500.00",
      account_code: "3.1.01",
      account_name: "Receita",
      counterparty_name: "Cliente A",
      document_ref: "NF 1",
      is_transfer: false,
      running_balance: "1500.00",
    },
    {
      transaction_id: "t2",
      cash_date: "2026-07-10",
      description: "Aluguel",
      direction: "outflow",
      amount: "200.00",
      signed_amount: "-200.00",
      account_code: "4.1.01",
      account_name: "Aluguel",
      counterparty_name: "Imobiliária",
      document_ref: null,
      is_transfer: false,
      running_balance: "1300.00",
    },
  ];

  const ds = () =>
    fakeDataSource({ rpc: { bank_account_period: resumo, bank_account_ledger: extrato } });
  const periodo = { from: "2026-07-01", to: "2026-07-31" };

  it("traz abertura, movimento e fechamento", async () => {
    const r = await getAccountLedger.run({ bank_account_id: CONTA, ...periodo }, ds());

    expect(dados(r).resumo).toMatchObject({
      saldo_abertura: 1000,
      entradas: 500,
      saidas: 200,
      saldo_fechamento: 1300,
    });
  });

  it("preserva o valor com sinal e o saldo corrente de cada linha", async () => {
    const r = await getAccountLedger.run({ bank_account_id: CONTA, ...periodo }, ds());

    expect(dados(r).lancamentos[1]).toMatchObject({
      valor: -200,
      saldo_corrente: 1300,
      transferencia: false,
    });
  });

  it("corta o FIM do extrato, não o começo, para não quebrar a cadeia de saldo", async () => {
    const r = await getAccountLedger.run({ bank_account_id: CONTA, ...periodo, limite: 1 }, ds());

    expect(dados(r).lancamentos).toHaveLength(1);
    expect(dados(r).lancamentos[0].id).toBe("t1");
    expect(r.meta.avisos?.join(" ")).toMatch(/cadeia do saldo corrente/);
  });

  it("mantém o fechamento correto mesmo quando corta linhas", async () => {
    const r = await getAccountLedger.run({ bank_account_id: CONTA, ...periodo, limite: 1 }, ds());

    expect(dados(r).resumo.saldo_fechamento).toBe(1300);
  });

  it("aponta a tool que descobre o id da conta", async () => {
    await expect(getAccountLedger.run(periodo, ds())).rejects.toThrow(/list_dimensions/);
  });
});
