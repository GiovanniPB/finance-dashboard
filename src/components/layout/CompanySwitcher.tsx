import { Building2, Check, ChevronsUpDown, Globe2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONSOLIDATED_KEY, useCompanyScope } from "@/features/companies/CompanyContext";

export function CompanySwitcher() {
  const {
    companies,
    selectedCompanyId,
    selectedCompany,
    isConsolidated,
    setSelectedCompanyId,
    loading,
  } = useCompanyScope();

  const operational = companies.filter((c) => !c.is_holding);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={loading}
          className="group flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium transition-colors hover:border-border-strong disabled:opacity-50"
        >
          {isConsolidated ? (
            <>
              <Globe2 className="size-4 text-accent" />
              <span>Consolidado</span>
            </>
          ) : (
            <>
              <Building2 className="size-4 text-text-muted" />
              <span className="max-w-[180px] truncate">
                {selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "Selecionar"}
              </span>
            </>
          )}
          <ChevronsUpDown className="size-3.5 text-text-subtle transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[260px]">
        <DropdownMenuLabel>Visualizar</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setSelectedCompanyId(CONSOLIDATED_KEY)}>
          <Globe2 className="size-4 text-accent" />
          <span className="flex-1">Consolidado</span>
          {isConsolidated && <Check className="size-4 text-accent" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Empresas</DropdownMenuLabel>
        {operational.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => setSelectedCompanyId(c.id)}>
            <Building2 className="size-4 text-text-muted" />
            <div className="flex flex-1 flex-col">
              <span className="text-sm">{c.trade_name ?? c.legal_name}</span>
              {c.trade_name && c.legal_name !== c.trade_name && (
                <span className="text-2xs truncate text-text-subtle">{c.legal_name}</span>
              )}
            </div>
            {selectedCompanyId === c.id && <Check className="size-4 text-accent" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
