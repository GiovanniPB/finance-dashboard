import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

import type { CashflowPeriodWithBalance } from "../types";

interface Props {
  data: CashflowPeriodWithBalance[] | null;
  loading: boolean;
}

export function CashflowSummary({ data, loading }: Props) {
  const totals = data?.reduce(
    (acc, p) => ({
      inflow: acc.inflow + p.inflow,
      outflow: acc.outflow + p.outflow,
      net: acc.net + p.net,
    }),
    { inflow: 0, outflow: 0, net: 0 },
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <SummaryCard
        label="Entradas no período"
        value={totals?.inflow ?? 0}
        icon={<ArrowUpRight className="size-4 text-income" />}
        tone="income"
        loading={loading}
      />
      <SummaryCard
        label="Saídas no período"
        value={totals?.outflow ?? 0}
        icon={<ArrowDownRight className="size-4 text-expense" />}
        tone="expense"
        loading={loading}
      />
      <SummaryCard
        label="Saldo do período"
        value={totals?.net ?? 0}
        icon={<Wallet className="size-4 text-accent" />}
        tone={totals && totals.net < 0 ? "expense" : "accent"}
        loading={loading}
      />
    </div>
  );
}

interface CardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "income" | "expense" | "accent";
  loading: boolean;
}

function SummaryCard({ label, value, icon, tone, loading }: CardProps) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center justify-between">
          <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            {label}
          </div>
          {icon}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <div
            className={cn(
              "font-mono text-2xl font-semibold tracking-tight",
              tone === "income" && "text-income",
              tone === "expense" && "text-expense",
              tone === "accent" && "text-accent",
            )}
          >
            {formatBRL(value)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
