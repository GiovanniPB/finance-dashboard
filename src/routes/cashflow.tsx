import { Calendar, Globe2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBalancesMulti } from "@/features/bank-accounts/hooks";
import { BankBalancesCard } from "@/features/cashflow/components/BankBalancesCard";
import { CashflowChart } from "@/features/cashflow/components/CashflowChart";
import { CashflowSummary } from "@/features/cashflow/components/CashflowSummary";
import { CashflowTable } from "@/features/cashflow/components/CashflowTable";
import { useCashflowDaily, useCashflowMonthly } from "@/features/cashflow/hooks";
import { useCashflowFilters } from "@/features/cashflow/useCashflowFilters";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { monthBounds } from "@/lib/dates";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export default function CashflowPage() {
  const { companyIds, isMultiCompany, scopeKind, scopeLabel, scopeCompanies } = useCompanyScope();
  const [filters, setFilters] = useCashflowFilters();

  const { year, granularity, month } = filters;
  const monthSelected = month >= 1 && month <= 12;

  // A specific month forces a daily view bounded to that month; otherwise the
  // selected granularity drives the whole-year range.
  const effectiveGranularity = monthSelected ? "daily" : granularity;
  const range = monthSelected
    ? monthBounds(new Date(year, month - 1, 1))
    : { start: `${year}-01-01`, end: `${year}-12-31` };

  // Recorte vazio desliga a consulta (só a granularidade ativa busca). `null` NÃO serve
  // para isso: null é o recorte do consolidado, ou seja, "todas as empresas".
  const OFF: string[] = [];
  const monthly = useCashflowMonthly(effectiveGranularity === "monthly" ? companyIds : OFF, year);
  const daily = useCashflowDaily(
    effectiveGranularity === "daily" ? companyIds : OFF,
    range.start,
    range.end,
  );

  const active = effectiveGranularity === "monthly" ? monthly : daily;

  // Saldo das contas no fim do período visível, para casar com a tabela ao lado.
  // `bank_balances_multi` soma o escopo inteiro — é o que faltava para o consolidado
  // deixar de cair na primeira empresa.
  const banks = useBalancesMulti(range.end, companyIds);

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            {isMultiCompany ? <Globe2 className="size-3 text-accent" /> : null}
            Fluxo de Caixa
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {scopeKind === "consolidated" ? "Consolidado" : scopeLabel}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Movimentação por data de caixa, com acumulado partindo de zero.
            {isMultiCompany && ` Somando ${scopeCompanies.length} empresa(s).`}
          </p>
        </div>
        <Badge tone="info">Regime de caixa</Badge>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-text-muted">
          <Calendar className="size-4" />
          <span className="text-xs font-medium tracking-wide uppercase">Período</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:max-w-2xl sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="granularity">Granularidade</Label>
            <Select
              value={granularity}
              onValueChange={(v) => void setFilters({ granularity: v as "daily" | "monthly" })}
              disabled={monthSelected}
            >
              <SelectTrigger id="granularity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="daily">Diária</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="year">Ano</Label>
            <Select
              value={String(year)}
              onValueChange={(v) => void setFilters({ year: Number(v) })}
            >
              <SelectTrigger id="year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="month">Mês</Label>
            <Select
              value={String(month)}
              onValueChange={(v) => void setFilters({ month: Number(v) })}
            >
              <SelectTrigger id="month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Ano inteiro</SelectItem>
                {MONTH_LABELS.map((label, i) => (
                  <SelectItem key={label} value={String(i + 1)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <CashflowSummary data={active.data ?? null} loading={active.isLoading} />

      <CashflowChart
        data={active.data ?? null}
        loading={active.isLoading}
        granularity={effectiveGranularity}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CashflowTable
            data={active.data ?? null}
            loading={active.isLoading}
            granularity={effectiveGranularity}
          />
        </div>
        <div>
          <BankBalancesCard data={banks.data} loading={banks.isLoading} asOf={range.end} />
        </div>
      </div>
    </div>
  );
}
