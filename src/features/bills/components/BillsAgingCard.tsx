import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

import { useBillsAging } from "../hooks";
import { NO_DUE_DATE_BUCKET, OVERDUE_BUCKETS, UPCOMING_BUCKETS, type AgingTone } from "../schema";
import type { AgingBucketRow, BillDirection } from "../types";

interface Props {
  companyIds: string[] | null;
  direction: BillDirection;
}

interface Bucket {
  value: string;
  label: string;
  tone: AgingTone;
}

/**
 * Aging na linha do tempo: o que já venceu à esquerda, o que vai vencer à
 * direita, mesma régua dos dois lados.
 *
 * As duas fileiras aparecem sob demanda. Empresa em dia não precisa ver quatro
 * caixas de atraso zeradas, e "sem vencimento" só faz sentido quando existe
 * título nessa situação — do contrário é ruído permanente para uma exceção.
 */
export function BillsAgingCard({ companyIds, direction }: Props) {
  const { data = [], isLoading } = useBillsAging(companyIds, direction);

  const byBucket = new Map(data.map((r) => [r.bucket, r]));
  const grandTotal = data.reduce((acc, r) => acc + (r.total ?? 0), 0);

  const sumOf = (buckets: Bucket[]) =>
    buckets.reduce((acc, b) => acc + (byBucket.get(b.value)?.total ?? 0), 0);

  const overdueTotal = sumOf(OVERDUE_BUCKETS);
  const noDueDate = byBucket.get(NO_DUE_DATE_BUCKET.value);
  const hasNoDueDate = (noDueDate?.count ?? 0) > 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
              Aging · {direction === "outflow" ? "A pagar" : "A receber"}
            </div>
            <div className="font-mono text-2xl font-semibold tracking-tight">
              {isLoading ? <Skeleton className="h-7 w-32" /> : formatBRL(grandTotal)}
            </div>
          </div>
          {!isLoading && overdueTotal > 0 && (
            <div className="text-right">
              <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
                Vencido
              </div>
              <div className="font-mono text-lg font-semibold text-expense">
                {formatBRL(overdueTotal)}
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {overdueTotal > 0 && (
              <BucketRow title="Vencido há" buckets={OVERDUE_BUCKETS} byBucket={byBucket} />
            )}
            <BucketRow title="Vence em" buckets={UPCOMING_BUCKETS} byBucket={byBucket} />
            {hasNoDueDate && (
              <BucketRow
                title="Pendência de cadastro"
                buckets={[NO_DUE_DATE_BUCKET]}
                byBucket={byBucket}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BucketRow({
  title,
  buckets,
  byBucket,
}: {
  title: string;
  buckets: Bucket[];
  byBucket: Map<string | null, AgingBucketRow>;
}) {
  return (
    <div>
      <div className="text-2xs mb-1.5 font-medium tracking-wide text-text-subtle uppercase">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {buckets.map((b) => {
          const row = byBucket.get(b.value);
          const count = row?.count ?? 0;
          return (
            <div
              key={b.value}
              className={cn(
                "rounded-[var(--radius-md)] border border-border bg-surface-2 p-2",
                count > 0 && b.tone === "expense" && "border-expense-soft",
                count > 0 && b.tone === "warning" && "border-warning-soft",
              )}
            >
              <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                {b.label}
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-sm font-semibold",
                  // Faixa zerada fica apagada: o olho vai direto no que tem valor.
                  count === 0 && "text-text-subtle",
                  count > 0 && b.tone === "expense" && "text-expense",
                  count > 0 && b.tone === "warning" && "text-warning",
                  count > 0 && b.tone === "info" && "text-info",
                )}
              >
                {formatBRL(row?.total ?? 0)}
              </div>
              <div className="text-2xs text-text-subtle">
                {count} título{count === 1 ? "" : "s"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
