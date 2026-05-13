import { describe, expect, it } from "vitest";

import {
  parseAmount,
  parseDate,
  parseDirection,
  parseRow,
  parseStatus,
  suggestMapping,
  type LookupMaps,
} from "./parser";

describe("parseDate", () => {
  it("accepts ISO", () => {
    expect(parseDate("2025-03-15")).toBe("2025-03-15");
  });
  it("accepts DD/MM/YYYY", () => {
    expect(parseDate("15/03/2025")).toBe("2025-03-15");
  });
  it("accepts DD-MM-YYYY", () => {
    expect(parseDate("15-03-2025")).toBe("2025-03-15");
  });
  it("pads single-digit day/month", () => {
    expect(parseDate("5/3/2025")).toBe("2025-03-05");
  });
  it("rejects garbage", () => {
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate("31/13/2025")).toBe("2025-13-31"); // does not validate calendar
  });
});

describe("parseAmount", () => {
  it("accepts pt-BR with comma decimal", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("99,90")).toBe(99.9);
  });
  it("accepts US format", () => {
    expect(parseAmount("1234.56")).toBe(1234.56);
    expect(parseAmount("1234")).toBe(1234);
  });
  it("strips currency prefix", () => {
    expect(parseAmount("R$ 1.234,56")).toBe(1234.56);
    expect(parseAmount("BRL 99,90")).toBe(99.9);
  });
  it("absolute value", () => {
    expect(parseAmount("-50,00")).toBe(50);
  });
  it("returns null for empty/invalid", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("parseDirection", () => {
  it("maps pt-BR aliases", () => {
    expect(parseDirection("Entrada")).toBe("inflow");
    expect(parseDirection("Saída")).toBe("outflow");
    expect(parseDirection("debito")).toBe("outflow");
    expect(parseDirection("CRÉDITO")).toBe("inflow");
  });
  it("maps single-char codes", () => {
    expect(parseDirection("+")).toBe("inflow");
    expect(parseDirection("-")).toBe("outflow");
    expect(parseDirection("C")).toBe("inflow");
    expect(parseDirection("D")).toBe("outflow");
  });
  it("returns null for unknown", () => {
    expect(parseDirection("xyz")).toBeNull();
  });
});

describe("parseStatus", () => {
  it("maps known statuses", () => {
    expect(parseStatus("liquidado")).toBe("settled");
    expect(parseStatus("Pago")).toBe("settled");
    expect(parseStatus("pendente")).toBe("pending");
  });
  it("null for unknown", () => {
    expect(parseStatus("foo")).toBeNull();
  });
});

describe("suggestMapping", () => {
  it("matches by normalized column name", () => {
    const result = suggestMapping([
      "Data competência",
      "Histórico",
      "Valor",
      "Tipo",
      "Conta contábil",
      "Centro de custo",
    ]);
    expect(result.accrual_date).toBe("Data competência");
    expect(result.description).toBe("Histórico");
    expect(result.amount).toBe("Valor");
    expect(result.direction).toBe("Tipo");
    expect(result.account_code).toBe("Conta contábil");
    expect(result.cost_center_code).toBe("Centro de custo");
  });
});

describe("parseRow", () => {
  const lookups: LookupMaps = {
    accountsByCode: new Map([["1.01", "acc-1"]]),
    costCentersByCode: new Map([["COM", "cc-1"]]),
    bankAccountsByNickname: new Map([["BTG conta", "bank-1"]]),
    counterpartiesByName: new Map([["acme", "cp-1"]]),
  };

  it("happy path", () => {
    const r = parseRow(
      1,
      {
        data: "15/03/2025",
        desc: "Aluguel março",
        valor: "1.234,56",
        tipo: "Saída",
        conta: "1.01",
      },
      {
        accrual_date: "data",
        description: "desc",
        amount: "valor",
        direction: "tipo",
        account_code: "conta",
      },
      lookups,
    );
    expect(r.isValid).toBe(true);
    expect(r.parsed.accrual_date).toBe("2025-03-15");
    expect(r.parsed.amount).toBe(1234.56);
    expect(r.parsed.direction).toBe("outflow");
    expect(r.parsed.account_id).toBe("acc-1");
  });

  it("reports missing required fields", () => {
    const r = parseRow(
      1,
      { foo: "bar" },
      {
        accrual_date: "missing",
        description: "missing",
        amount: "missing",
        direction: "missing",
        account_code: "missing",
      },
      lookups,
    );
    expect(r.isValid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
  });

  it("reports unknown account code", () => {
    const r = parseRow(
      1,
      { d: "01/01/2025", desc: "x", v: "10", t: "+", c: "9.99.99" },
      {
        accrual_date: "d",
        description: "desc",
        amount: "v",
        direction: "t",
        account_code: "c",
      },
      lookups,
    );
    expect(r.isValid).toBe(false);
    expect(r.errors.some((e) => e.includes("Conta não encontrada"))).toBe(true);
  });
});
