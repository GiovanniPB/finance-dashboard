import * as React from "react";
import {
  Building2,
  Crown,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import { type Company } from "@/features/companies/api";
import { CompanyDrawer } from "@/features/companies/components/CompanyDrawer";
import { useAllCompanies, useCompanyStats } from "@/features/companies/hooks";
import { TAX_REGIMES } from "@/features/companies/schema";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

const TAX_REGIME_LABELS = Object.fromEntries(TAX_REGIMES.map((r) => [r.value, r.label]));

function formatCnpj(cnpj: string | null): string {
  if (cnpj?.length !== 14) return cnpj ?? "—";
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

export default function CompaniesPage() {
  const { data: companies = [], isLoading } = useAllCompanies();
  const { data: stats = [] } = useCompanyStats();
  const { canManage } = usePermissions();

  const organizationId = companies[0]?.organization_id ?? ORGANIZATION_ID;

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Company | null>(null);

  const statsByCompany = React.useMemo(
    () => Object.fromEntries(stats.map((s) => [s.company_id, s])),
    [stats],
  );

  const activeCount = companies.filter((c) => c.is_active).length;
  const operationalCount = companies.filter((c) => c.is_active && !c.is_holding).length;

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            <Building2 className="size-3 text-accent" />
            Empresas
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">OTM Group</h1>
          <p className="mt-1 text-sm text-text-muted">
            {activeCount} ativa(s) · {operationalCount} operacional(is)
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="size-4" /> Nova empresa
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma empresa cadastrada.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              stats={statsByCompany[company.id]}
              canManage={canManage}
              onEdit={() => {
                setEditing(company);
                setDrawerOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <CompanyDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        company={editing}
        organizationId={organizationId}
      />
    </div>
  );
}

interface CompanyCardProps {
  company: Company;
  stats:
    | {
        tx_count: number;
        tx_count_ytd: number;
        revenue_ytd: number;
        expense_ytd: number;
        last_activity: string | null;
        bank_account_count: number;
        employee_count_active: number;
      }
    | undefined;
  canManage: boolean;
  onEdit: () => void;
}

function CompanyCard({ company, stats, canManage, onEdit }: CompanyCardProps) {
  const accentColor = company.brand_color ?? "var(--color-accent)";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-sm)]",
        !company.is_active && "opacity-60",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: accentColor }}
      />

      <div className="space-y-4 p-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-lg font-semibold tracking-tight">
                {company.trade_name ?? company.legal_name}
              </h2>
              {company.is_holding && (
                <Badge tone="accent" className="shrink-0">
                  <Crown className="size-3" /> Holding
                </Badge>
              )}
            </div>
            {company.trade_name && (
              <p className="truncate text-xs text-text-muted">{company.legal_name}</p>
            )}
            <div className="text-2xs mt-2 flex flex-wrap items-center gap-2 text-text-subtle">
              <span className="font-mono">{formatCnpj(company.cnpj)}</span>
              <span aria-hidden>·</span>
              <span>{TAX_REGIME_LABELS[company.tax_regime] ?? company.tax_regime}</span>
              {!company.is_active && (
                <>
                  <span aria-hidden>·</span>
                  <Badge tone="default">Inativa</Badge>
                </>
              )}
            </div>
          </div>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Ações"
                  className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-2 hover:text-text"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="size-4" /> Editar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <StatBlock
            label="Receita YTD"
            value={stats ? formatBRL(stats.revenue_ytd) : "—"}
            icon={<TrendingUp className="size-3.5" />}
            tone="income"
          />
          <StatBlock
            label="Despesa YTD"
            value={stats ? formatBRL(stats.expense_ytd) : "—"}
            icon={<TrendingDown className="size-3.5" />}
            tone="expense"
          />
          <StatBlock
            label="Lançamentos YTD"
            value={stats ? stats.tx_count_ytd.toLocaleString("pt-BR") : "—"}
            icon={<Receipt className="size-3.5" />}
            tone="info"
          />
          <StatBlock
            label="Colaboradores"
            value={stats ? String(stats.employee_count_active) : "—"}
            icon={<Users className="size-3.5" />}
            tone="default"
          />
        </div>

        <div className="text-2xs flex items-center justify-between border-t border-border pt-3 text-text-subtle">
          <span className="inline-flex items-center gap-1">
            <PiggyBank className="size-3" />
            {stats?.bank_account_count ?? 0} conta(s) bancária(s)
          </span>
          <span>
            {stats?.last_activity
              ? `Última atividade ${formatDate(stats.last_activity)}`
              : "Sem atividade"}
          </span>
        </div>
      </div>
    </div>
  );
}

interface StatBlockProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "income" | "expense" | "info" | "default";
}

function StatBlock({ label, value, icon, tone }: StatBlockProps) {
  const toneClass = {
    income: "text-income",
    expense: "text-expense",
    info: "text-info",
    default: "text-text",
  }[tone];

  return (
    <div className="space-y-1">
      <div className="text-2xs flex items-center gap-1 font-medium tracking-wide text-text-subtle uppercase">
        {icon}
        {label}
      </div>
      <div className={cn("font-mono text-sm font-semibold tabular-nums", toneClass)}>{value}</div>
    </div>
  );
}
