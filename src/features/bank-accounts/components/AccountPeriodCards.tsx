import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import type { AccountPeriodSummary } from "../api";

interface Props {
  data: AccountPeriodSummary | undefined;
  loading: boolean;
  from: string;
  to: string;
}

export function AccountPeriodCards({ data, loading, from, to }: Props) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full" />
        ))}
      </div>
    );
  }

  const net = data.inflow - data.outflow;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat
        label={`Saldo em ${formatDate(from)}`}
        value={data.opening_balance}
        icon={<Wallet className="size-4 text-text-subtle" />}
        tone={data.opening_balance < 0 ? "expense" : "neutral"}
      />
      <Stat
        label="Entradas no período"
        value={data.inflow}
        icon={<ArrowUpRight className="size-4 text-income" />}
        tone="income"
      />
      <Stat
        label="Saídas no período"
        value={data.outflow}
        icon={<ArrowDownRight className="size-4 text-expense" />}
        tone="expense"
      />
      <Stat
        label={`Saldo em ${formatDate(to)}`}
        value={data.closing_balance}
        hint={`${net >= 0 ? "+" : ""}${formatBRL(net)} no período`}
        icon={<Wallet className="size-4 text-accent" />}
        tone={data.closing_balance < 0 ? "expense" : "accent"}
        emphasis
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
  tone,
  emphasis,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: React.ReactNode;
  tone: "income" | "expense" | "accent" | "neutral";
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-surface p-4",
        emphasis && "border-accent/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
          {label}
        </span>
        {icon}
      </div>
      <div
        className={cn(
          "mt-2 font-mono text-xl font-semibold tabular-nums",
          tone === "income" && "text-income",
          tone === "expense" && "text-expense",
          tone === "accent" && "text-accent",
        )}
      >
        {formatBRL(value)}
      </div>
      {hint && <div className="text-2xs mt-1 text-text-subtle">{hint}</div>}
    </div>
  );
}
