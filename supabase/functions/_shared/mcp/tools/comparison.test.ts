import { describe, expect, it } from "vitest";

import { fakeDataSource, type RpcCall } from "../fixtures.ts";
import type { McpDataSource, TableQuery } from "../types.ts";
import { comparePeriods, variacaoPct } from "./comparison.ts";

const EMPRESA = "11111111-2222-3333-4444-555555555555";
const ORG = "99999999-8888-7777-6666-555555555555";

/**
 * DataSource que devolve conjuntos DIFERENTES na primeira e na segunda chamada.
 *
 * O fake padrão devolve sempre a mesma resposta para uma RPC, e com isso os dois
 * períodos ficam idênticos — variação zero, linhas filtradas, teste que não testa
 * nada. Comparação precisa de dois lados distintos.
 */
function dsDoisPeriodos(
  fn: string,
  periodoA: unknown[],
  periodoB: unknown[],
): McpDataSource & { rpcCalls: RpcCall[] } {
  const rpcCalls: RpcCall[] = [];
  return {
    rpcCalls,
    async rpc<T>(nome: string, args: Record<string, unknown>): Promise<T[]> {
      rpcCalls.push({ fn: nome, args });
      const chamada = rpcCalls.filter((c) => c.fn === nome).length;
      return (nome === fn ? (chamada === 1 ? periodoA : periodoB) : []) as T[];
    },
    async query<T>(_q: TableQuery): Promise<T[]> {
      return [] as T[];
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const linha = (over: Record<string, unknown>) => ({
  account_id: "acc-1",
  parent_id: null,
  code: "4.1.01",
  name: "Aluguel",
  kind: "operating_expense",
  dre_section: "fixed_costs",
  is_summary: false,
  below_the_line: false,
  sort_order: 10,
  total: "0",
  total_cash: "0",
  ...over,
});

describe("variacaoPct", () => {
  it("calcula crescimento sobre base positiva", () => {
    expect(variacaoPct(120, 100)).toBe(20);
  });

  it("receita que cai dá percentual negativo", () => {
    expect(variacaoPct(80, 100)).toBe(-20);
  });

  it("despesa que CRESCE dá percentual negativo — piorou o resultado", () => {
    // Saída é negativa na DRE: de -100 para -120 gastou-se mais.
    expect(variacaoPct(-120, -100)).toBe(-20);
  });

  it("despesa que CAI dá percentual positivo — melhorou o resultado", () => {
    expect(variacaoPct(-80, -100)).toBe(20);
  });

  it("o sinal do percentual sempre acompanha o da variação absoluta", () => {
    // É o que o módulo na base compra. Com base assinada, estes dois casos sairiam
    // com sinais opostos entre variacao e variacao_pct.
    const casos: [number, number][] = [
      [120, 100],
      [80, 100],
      [-120, -100],
      [-80, -100],
    ];
    for (const [atual, anterior] of casos) {
      const pct = variacaoPct(atual, anterior);
      expect(Math.sign(pct as number)).toBe(Math.sign(atual - anterior));
    }
  });

  it("devolve null sobre base zero em vez de infinito", () => {
    expect(variacaoPct(100, 0)).toBeNull();
  });

  it("arredonda para uma casa decimal", () => {
    expect(variacaoPct(1, 3)).toBe(-66.7);
  });
});

describe("compare_periods", () => {
  /** A mesma RPC responde os dois períodos; o fake devolve o mesmo conjunto. */
  const dsCom = (linhas: unknown[]) => fakeDataSource({ rpc: { dre_by_company: linhas } });

  const janelas = {
    periodo_a_from: "2026-07-01",
    periodo_a_to: "2026-07-31",
    periodo_b_from: "2026-06-01",
    periodo_b_to: "2026-06-30",
  };

  it("chama a DRE uma vez por período, com as janelas certas", async () => {
    const d = dsCom([linha({ total: "-100.00" })]);
    await comparePeriods.run({ company_id: EMPRESA, ...janelas }, d);

    expect(d.rpcCalls).toHaveLength(2);
    expect(d.rpcCalls[0].args).toMatchObject({ p_start: "2026-07-01", p_end: "2026-07-31" });
    expect(d.rpcCalls[1].args).toMatchObject({ p_start: "2026-06-01", p_end: "2026-06-30" });
  });

  it("usa a RPC consolidada quando o escopo é a organização", async () => {
    const d = fakeDataSource({ rpc: { dre_consolidated: [linha({ master_id: "m1" })] } });
    await comparePeriods.run({ organization_id: ORG, ...janelas }, d);

    expect(d.rpcCalls[0].fn).toBe("dre_consolidated");
  });

  it("calcula variação por linha entre os dois períodos", async () => {
    const d = dsDoisPeriodos(
      "dre_by_company",
      [linha({ total: "-120.00" })],
      [linha({ total: "-100.00" })],
    );
    const r = await comparePeriods.run({ company_id: EMPRESA, ...janelas }, d);

    const alvo = dados(r).linhas.find((l: any) => l.codigo === "4.1.01");
    // Despesa subiu: variação e percentual ambos negativos (piorou o resultado).
    expect(alvo).toMatchObject({ valor_a: -120, valor_b: -100, variacao: -20, variacao_pct: -20 });
  });

  it("recupera conta que existe só no período de comparação", async () => {
    // "Sumiu" é a variação que mais interessa; sem este resgate a linha
    // desapareceria do relatório junto com o valor.
    const d = dsDoisPeriodos(
      "dre_by_company",
      [],
      [linha({ account_id: "extinta", code: "4.9.99", name: "Conta extinta", total: "-500.00" })],
    );
    const r = await comparePeriods.run({ company_id: EMPRESA, ...janelas }, d);

    expect(dados(r).linhas).toEqual([
      expect.objectContaining({ codigo: "4.9.99", valor_a: 0, valor_b: -500, variacao: 500 }),
    ]);
  });

  it("ordena as maiores variações por valor absoluto", async () => {
    const d = dsDoisPeriodos(
      "dre_by_company",
      [
        linha({ account_id: "a", code: "4.1.01", total: "-110.00", sort_order: 10 }),
        linha({ account_id: "b", code: "4.1.02", total: "-1000.00", sort_order: 20 }),
      ],
      [
        linha({ account_id: "a", code: "4.1.01", total: "-100.00", sort_order: 10 }),
        linha({ account_id: "b", code: "4.1.02", total: "-100.00", sort_order: 20 }),
      ],
    );
    const r = await comparePeriods.run({ company_id: EMPRESA, ...janelas }, d);

    expect(dados(r).maiores_variacoes.map((l: any) => l.codigo)).toEqual(["4.1.02", "4.1.01"]);
  });

  it("omite linha sem variação por padrão, mas mantém totalizadora", async () => {
    const d = dsCom([
      linha({ total: "-100.00" }),
      linha({
        account_id: "sum",
        code: "4",
        name: "(=) Despesas",
        is_summary: true,
        sort_order: 5,
      }),
    ]);
    const r = await comparePeriods.run({ company_id: EMPRESA, ...janelas }, d);

    expect(dados(r).linhas.map((l: any) => l.codigo)).toEqual(["4"]);
    expect(dados(r).resumo).toHaveLength(1);
  });

  it("devolve todas as linhas quando apenas_com_variacao é false", async () => {
    const d = dsCom([linha({ total: "-100.00" })]);
    const r = await comparePeriods.run(
      { company_id: EMPRESA, ...janelas, apenas_com_variacao: false },
      d,
    );

    expect(dados(r).linhas).toHaveLength(1);
  });

  it("maiores_variacoes exclui totalizadora, que só repete a soma das analíticas", async () => {
    const d = dsCom([
      linha({
        account_id: "sum",
        code: "4",
        name: "(=) Despesas",
        is_summary: true,
        sort_order: 5,
      }),
      linha({ total: "-100.00" }),
    ]);
    const r = await comparePeriods.run({ company_id: EMPRESA, ...janelas }, d);

    expect(dados(r).maiores_variacoes.every((l: any) => !l.totalizadora)).toBe(true);
  });

  it("respeita o regime de caixa", async () => {
    const d = dsDoisPeriodos(
      "dre_by_company",
      [linha({ total: "-100.00", total_cash: "-40.00" })],
      [linha({ total: "-100.00", total_cash: "-10.00" })],
    );
    const r = await comparePeriods.run({ company_id: EMPRESA, ...janelas, regime: "caixa" }, d);

    expect(r.meta.regime).toBe("caixa");
    expect(dados(r).linhas[0]).toMatchObject({ valor_a: -40, valor_b: -10 });
  });

  it("avisa quando A não é posterior a B, porque a leitura de variação inverte", async () => {
    const d = dsCom([linha({ total: "-100.00" })]);
    const r = await comparePeriods.run(
      {
        company_id: EMPRESA,
        periodo_a_from: "2026-06-01",
        periodo_a_to: "2026-06-30",
        periodo_b_from: "2026-07-01",
        periodo_b_to: "2026-07-31",
      },
      d,
    );

    expect(r.meta.avisos?.join(" ")).toMatch(/ordem é a pretendida/);
  });

  it("não avisa quando a ordem está correta", async () => {
    const d = dsCom([linha({ total: "-100.00" })]);
    const r = await comparePeriods.run({ company_id: EMPRESA, ...janelas }, d);

    expect(r.meta.avisos ?? []).toHaveLength(0);
  });

  it("recusa janela invertida dentro de um mesmo período", async () => {
    await expect(
      comparePeriods.run(
        {
          company_id: EMPRESA,
          periodo_a_from: "2026-07-31",
          periodo_a_to: "2026-07-01",
          periodo_b_from: "2026-06-01",
          periodo_b_to: "2026-06-30",
        },
        fakeDataSource(),
      ),
    ).rejects.toThrow(/posterior/);
  });

  it("exige escopo", async () => {
    await expect(comparePeriods.run(janelas, fakeDataSource())).rejects.toThrow(/list_companies/);
  });
});
