import { describe, expect, it } from "vitest";

import type { LedgerEntry } from "./api";
import { balanceRange, toBalanceSeries } from "./compute";

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, "cash_date">): LedgerEntry {
  return {
    transaction_id: crypto.randomUUID(),
    description: "lançamento",
    direction: "outflow",
    amount: 100,
    signed_amount: -100,
    account_code: null,
    account_name: null,
    counterparty_name: null,
    document_ref: null,
    running_balance: 0,
    ...partial,
  };
}

describe("toBalanceSeries", () => {
  it("usa o saldo de abertura como primeiro ponto", () => {
    const series = toBalanceSeries(
      [entry({ cash_date: "2026-03-10", running_balance: 900 })],
      1000,
      "2026-03-01",
    );
    expect(series[0]).toEqual({ date: "2026-03-01", balance: 1000, inflow: 0, outflow: 0 });
    expect(series).toHaveLength(2);
  });

  it("condensa vários lançamentos do mesmo dia num ponto de fechamento", () => {
    const series = toBalanceSeries(
      [
        entry({ cash_date: "2026-03-10", direction: "outflow", amount: 100, running_balance: 900 }),
        entry({ cash_date: "2026-03-10", direction: "inflow", amount: 250, running_balance: 1150 }),
        entry({ cash_date: "2026-03-10", direction: "outflow", amount: 50, running_balance: 1100 }),
      ],
      1000,
      "2026-03-01",
    );

    const day = series[1];
    expect(day.balance).toBe(1100); // fechamento, não o primeiro lançamento
    expect(day.inflow).toBe(250);
    expect(day.outflow).toBe(150); // 100 + 50
    expect(series).toHaveLength(2);
  });

  it("não duplica o ponto quando já há movimento no dia inicial", () => {
    const series = toBalanceSeries(
      [entry({ cash_date: "2026-03-01", running_balance: 900 })],
      1000,
      "2026-03-01",
    );
    expect(series).toHaveLength(1);
    expect(series[0].balance).toBe(900);
  });

  it("devolve só a abertura quando não há lançamentos", () => {
    expect(toBalanceSeries([], 500, "2026-03-01")).toEqual([
      { date: "2026-03-01", balance: 500, inflow: 0, outflow: 0 },
    ]);
  });

  it("preserva a ordem cronológica dos dias", () => {
    const series = toBalanceSeries(
      [
        entry({ cash_date: "2026-03-05", running_balance: 900 }),
        entry({ cash_date: "2026-03-12", running_balance: 700 }),
        entry({ cash_date: "2026-03-20", running_balance: 1300 }),
      ],
      1000,
      "2026-03-01",
    );
    expect(series.map((p) => p.date)).toEqual([
      "2026-03-01",
      "2026-03-05",
      "2026-03-12",
      "2026-03-20",
    ]);
  });
});

describe("balanceRange", () => {
  it("acha o menor e o maior saldo, inclusive negativo", () => {
    const series = toBalanceSeries(
      [
        entry({ cash_date: "2026-03-05", running_balance: -200 }),
        entry({ cash_date: "2026-03-12", running_balance: 1500 }),
      ],
      1000,
      "2026-03-01",
    );
    expect(balanceRange(series)).toEqual({ min: -200, max: 1500 });
  });

  it("devolve null para série vazia", () => {
    expect(balanceRange([])).toBeNull();
  });
});
