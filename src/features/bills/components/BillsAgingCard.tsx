import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

import { useBillsAging } from "../hooks";
import { AGING_BUCKETS } from "../schema";
import type { BillDirection } from "../types";

interface Props {
  companyId: string | null;
  direction: BillDirection;
}

export function BillsAgingCard({ companyId, direction }: Props) {
  const { data = [], isLoading } = useBillsAging(companyId, direction);

  const byBucket = new Map(data.map((r) => [r.bucket, r]));
  const grandTotal = data.reduce((acc, r) => acc + (r.total ?? 0), 0);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
              Aging · {direction === "outflow" ? "A pagar" : "A receber"}
            </div>
            <div className="font-mono text-2xl font-semibold tracking-tight">
              {isLoading ? <Skeleton className="h-7 w-32" /> : formatBRL(grandTotal)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {AGING_BUCKETS.map((b) => {
            const row = byBucket.get(b.value);
            return (
              <div
                key={b.value}
                className={cn(
                  "rounded-[var(--radius-md)] border border-border bg-surface-2 p-2",
                  b.tone === "expense" && "border-expense-soft",
                  b.tone === "warning" && "border-warning-soft",
                )}
              >
                <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                  {b.label}
                </div>
                {isLoading ? (
                  <Skeleton className="mt-1 h-5 w-full" />
                ) : (
                  <>
                    <div
                      className={cn(
                        "mt-1 font-mono text-sm font-semibold",
                        b.tone === "expense" && "text-expense",
                        b.tone === "warning" && "text-warning",
                        b.tone === "info" && "text-info",
                      )}
                    >
                      {formatBRL(row?.total ?? 0)}
                    </div>
                    <div className="text-2xs text-text-subtle">
                      {row?.count ?? 0} título{(row?.count ?? 0) === 1 ? "" : "s"}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
