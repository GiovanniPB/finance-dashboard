import { describe, expect, it } from "vitest";

import {
  DATE_COLUMN_BY_BASIS,
  directionForMeasure,
  STATUSES_BY_BASIS,
  unclassifiedOrFilter,
} from "./drilldown";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("directionForMeasure", () => {
  it("restringe ao lado que a medida soma", () => {
    expect(directionForMeasure("revenue")).toBe("inflow");
    expect(directionForMeasure("expense")).toBe("outflow");
  });

  it("não restringe quando a linha é líquida", () => {
    expect(directionForMeasure("net")).toBeNull();
  });
});

describe("unclassifiedOrFilter", () => {
  it("exclui os centros cobertos de cada lado, mantendo os sem centro", () => {
    const filter = unclassifiedOrFilter({ revenueCovered: [A], expenseCovered: [B] });

    expect(filter).toBe(
      `and(direction.eq.inflow,or(cost_center_id.is.null,cost_center_id.not.in.("${A}"))),` +
        `and(direction.eq.outflow,or(cost_center_id.is.null,cost_center_id.not.in.("${B}")))`,
    );
  });

  it("não restringe o lado que o modelo não cobre", () => {
    // Nenhuma linha soma entradas: então toda entrada é não classificada.
    const filter = unclassifiedOrFilter({ revenueCovered: [], expenseCovered: [A] });

    expect(filter).toBe(
      `direction.eq.inflow,` +
        `and(direction.eq.outflow,or(cost_center_id.is.null,cost_center_id.not.in.("${A}")))`,
    );
  });

  it("pega os dois lados inteiros quando o modelo não cobre nada", () => {
    expect(unclassifiedOrFilter({ revenueCovered: [], expenseCovered: [] })).toBe(
      "direction.eq.inflow,direction.eq.outflow",
    );
  });

  it("aspas em cada id para o id não ser confundido com separador da lista", () => {
    const filter = unclassifiedOrFilter({ revenueCovered: [A, B], expenseCovered: [] });

    expect(filter).toContain(`cost_center_id.not.in.("${A}","${B}")`);
  });
});

/*
 * Estes filtros precisam ser os mesmos da RPC `cost_center_monthly_series`. Se
 * divergirem, a gaveta deixa de somar o valor da célula clicada — e é isso, e não
 * a forma do filtro, que o usuário percebe como bug.
 */
describe("filtros por regime", () => {
  it("competência inclui pendente; caixa não", () => {
    expect(STATUSES_BY_BASIS.accrual).toContain("pending");
    expect(STATUSES_BY_BASIS.cash).not.toContain("pending");
  });

  it("nenhum regime inclui agendado — previsão não é fato", () => {
    expect(STATUSES_BY_BASIS.accrual).not.toContain("scheduled");
    expect(STATUSES_BY_BASIS.cash).not.toContain("scheduled");
  });

  it("cada regime data o lançamento pela sua própria coluna", () => {
    expect(DATE_COLUMN_BY_BASIS.accrual).toBe("accrual_date");
    expect(DATE_COLUMN_BY_BASIS.cash).toBe("cash_date");
  });
});
