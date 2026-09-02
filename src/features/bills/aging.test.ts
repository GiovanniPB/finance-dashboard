import { describe, expect, it } from "vitest";

import { aggregateAgingByBucket } from "./api";
import type { AgingBucketRow } from "./types";

const row = (companyId: string, bucket: string, total: number, count: number): AgingBucketRow => ({
  company_id: companyId,
  direction: "outflow",
  bucket,
  count,
  total,
});

describe("aggregateAgingByBucket", () => {
  it("soma a mesma faixa de empresas diferentes numa linha só", () => {
    const rows = [row("a", "overdue_0_30", 100, 2), row("c", "overdue_0_30", 50, 1)];
    const [bucket] = aggregateAgingByBucket(rows, ["a", "c"]);

    expect(bucket.total).toBe(150);
    expect(bucket.count).toBe(3);
  });

  it("apaga company_id ao somar mais de uma empresa", () => {
    // Deixar o id da primeira empresa faria a faixa parecer ser só dela.
    const rows = [row("a", "due_0_30", 10, 1), row("c", "due_0_30", 20, 1)];
    expect(aggregateAgingByBucket(rows, ["a", "c"])[0].company_id).toBeNull();
  });

  it("preserva company_id quando o escopo é uma empresa", () => {
    expect(aggregateAgingByBucket([row("a", "due_0_30", 10, 1)], ["a"])[0].company_id).toBe("a");
  });

  it("mantém faixas distintas separadas", () => {
    const rows = [
      row("a", "overdue_0_30", 100, 1),
      row("c", "due_31_60", 70, 2),
      row("a", "due_31_60", 30, 1),
    ];
    const byBucket = new Map(aggregateAgingByBucket(rows, ["a", "c"]).map((b) => [b.bucket, b]));

    expect(byBucket.get("overdue_0_30")?.total).toBe(100);
    expect(byBucket.get("due_31_60")?.total).toBe(100);
  });

  it("o total somado das faixas é o total em aberto do escopo", () => {
    const rows = [
      row("a", "overdue_0_30", 100, 1),
      row("c", "overdue_0_30", 200, 1),
      row("a", "no_due_date", 5, 1),
    ];
    const total = aggregateAgingByBucket(rows, ["a", "c"]).reduce((s, b) => s + (b.total ?? 0), 0);

    expect(total).toBe(305);
  });

  it("escopo sem título nenhum devolve lista vazia", () => {
    expect(aggregateAgingByBucket([], null)).toEqual([]);
  });
});
