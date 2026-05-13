import { Calendar, Globe2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { BankBalancesCard } from "@/features/cashflow/components/BankBalancesCard";
import { CashflowChart } from "@/features/cashflow/components/CashflowChart";
import { CashflowSummary } from "@/features/cashflow/components/CashflowSummary";
import { CashflowTable } from "@/features/cashflow/components/CashflowTable";
import { useBankBalances, useCashflowDaily, useCashflowMonthly } from "@/features/cashflow/hooks";
import { useCashflowFilters } from "@/features/cashflow/useCashflowFilters";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { isoDate } from "@/lib/dates";

export default function CashflowPage() {
  const { selectedCompanyId, selectedCompany, isConsolidated, companies } = useCompanyScope();
  const [filters, setFilters] = useCashflowFilters();

  // No consolidated mode yet — fallback to first operational company.
  const operational = companies.filter((c) => !c.is_holding);
  const effectiveCompanyId = isConsolidated ? (operational[0]?.id ?? null) : selectedCompanyId;

  const { year, granularity } = filters;
  const periodFrom = `${year}-01-01`;
  const periodTo = `${year}-12-31`;

  const monthly = useCashflowMonthly(granularity === "monthly" ? effectiveCompanyId : null, year);
  const daily = useCashflowDaily(
    granularity === "daily" ? effectiveCompanyId : null,
    periodFrom,
    periodTo,
  );

  const active = granularity === "monthly" ? monthly : daily;

  const banks = useBankBalances(effectiveCompanyId, isoDate(new Date(year, 0, 1)));

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            {isConsolidated ? <Globe2 className="size-3 text-accent" /> : null}
            Fluxo de Caixa
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {isConsolidated
              ? `Demo · ${operational[0]?.trade_name ?? "—"}`
              : (selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Movimentação por data de caixa, com acumulado partindo de zero (saldo inicial dos bancos
            ainda não cadastrado).
          </p>
        </div>
        <Badge tone="info">Regime de caixa</Badge>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-text-muted">
          <Calendar className="size-4" />
          <span className="text-xs font-medium tracking-wide uppercase">Período</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:max-w-md sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="granularity">Granularidade</Label>
            <Select
              id="granularity"
              value={granularity}
              onChange={(e) =>
                void setFilters({
                  granularity: e.target.value as "daily" | "monthly",
                })
              }
            >
              <option value="monthly">Mensal</option>
              <option value="daily">Diária</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="year">Ano</Label>
            <Select
              id="year"
              value={String(year)}
              onChange={(e) => void setFilters({ year: Number(e.target.value) })}
            >
              {[2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <CashflowSummary data={active.data ?? null} loading={active.isLoading} />

      <CashflowChart
        data={active.data ?? null}
        loading={active.isLoading}
        granularity={granularity}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CashflowTable
            data={active.data ?? null}
            loading={active.isLoading}
            granularity={granularity}
            companyId={effectiveCompanyId}
          />
        </div>
        <div>
          <BankBalancesCard data={banks.data} loading={banks.isLoading} />
        </div>
      </div>
    </div>
  );
}
