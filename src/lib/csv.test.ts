import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

interface Row {
  date: string;
  description: string;
  amount: number;
}

describe("toCsv", () => {
  const cols = [
    { key: "date", header: "Data", getValue: (r: Row) => r.date },
    { key: "description", header: "Descrição", getValue: (r: Row) => r.description },
    { key: "amount", header: "Valor", getValue: (r: Row) => r.amount },
  ];

  it("renders header + body with CRLF", () => {
    const csv = toCsv(
      [
        { date: "2025-01-15", description: "Aluguel", amount: 1234.56 },
        { date: "2025-02-15", description: "Internet", amount: 99.9 },
      ],
      cols,
    );
    expect(csv).toBe(
      "Data,Descrição,Valor\r\n2025-01-15,Aluguel,1234.56\r\n2025-02-15,Internet,99.9",
    );
  });

  it("escapes cells containing commas or quotes", () => {
    const csv = toCsv(
      [{ date: "2025-01-15", description: 'Item "especial", com vírgula', amount: 100 }],
      cols,
    );
    expect(csv).toContain('"Item ""especial"", com vírgula"');
  });

  it("handles nullish gracefully", () => {
    const csv = toCsv(
      [{ date: "2025-01-15", description: null as unknown as string, amount: 0 }],
      cols,
    );
    expect(csv).toContain("2025-01-15,,0");
  });
});
