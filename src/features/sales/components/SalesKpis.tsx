import { CreditCard, Percent, Receipt, Ticket, TrendingUp, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";

import type { SalesCustomers, SalesOverview } from "../api";

interface Props {
  overview: SalesOverview | undefined;
  customers: SalesCustomers | undefined;
  loading: boolean;
}

export function SalesKpis({ overview, customers, loading }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <KpiCard
        label="Vendas no período"
        value={formatBRL(overview?.gmv ?? 0)}
        hint={`${formatNumber(overview?.salesCount ?? 0)} vendas`}
        icon={<TrendingUp className="size-4 text-accent" />}
        loading={loading}
      />
      <KpiCard
        label="Ticket médio"
        value={formatBRL(overview?.avgTicket ?? 0)}
        hint={
          overview?.installmentsAvg
            ? `${formatNumber(overview.installmentsAvg)}x em média`
            : "parcelamento não informado"
        }
        icon={<Ticket className="size-4 text-accent" />}
        loading={loading}
      />
      <KpiCard
        label="Taxa de aprovação"
        value={
          overview?.approvalRate === null || overview?.approvalRate === undefined
            ? "—"
            : formatPercent(overview.approvalRate, { fromHundred: true })
        }
        hint={`${formatNumber(overview?.failedCount ?? 0)} de ${formatNumber(
          overview?.attemptsCount ?? 0,
        )} tentativas recusadas`}
        icon={<Percent className="size-4 text-accent" />}
        loading={loading}
      />
      <KpiCard
        label="Estornos e chargebacks"
        value={formatBRL(overview?.refunded ?? 0)}
        hint={`venda líquida ${formatBRL(overview?.netSales ?? 0)}`}
        icon={<Receipt className="size-4 text-expense" />}
        tone={overview && overview.refunded > 0 ? "expense" : "default"}
        loading={loading}
      />
      <KpiCard
        label="Clientes que compraram"
        value={formatNumber(overview?.customersCount ?? 0)}
        hint={
          customers
            ? `${formatNumber(customers.newCustomers)} novos · ${formatNumber(
                customers.returningCustomers,
              )} recorrentes`
            : "—"
        }
        icon={<Users className="size-4 text-accent" />}
        loading={loading}
      />
      <KpiCard
        label="Receita de recorrentes"
        value={formatBRL(customers?.returningRevenue ?? 0)}
        hint={
          customers?.repeatRate === null || customers?.repeatRate === undefined
            ? "—"
            : `${formatPercent(customers.repeatRate, { fromHundred: true })} dos clientes já haviam comprado`
        }
        icon={<CreditCard className="size-4 text-accent" />}
        loading={loading}
      />
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone?: "default" | "expense";
  loading: boolean;
}

function KpiCard({ label, value, hint, icon, tone = "default", loading }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            {label}
          </span>
          {icon}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-32" />
        ) : (
          <div
            className={
              tone === "expense"
                ? "mt-2 font-display text-2xl font-semibold tracking-tight text-expense"
                : "mt-2 font-display text-2xl font-semibold tracking-tight"
            }
          >
            {value}
          </div>
        )}
        <p className="mt-1 text-xs text-text-muted">{loading ? "" : hint}</p>
      </CardContent>
    </Card>
  );
}
