import * as React from "react";
import { MoreHorizontal, Pencil, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { type Employee } from "@/features/employees/api";
import { EmployeeDrawer } from "@/features/employees/components/EmployeeDrawer";
import { useEmployees } from "@/features/employees/hooks";
import { EMPLOYEE_STATUSES } from "@/features/employees/schema";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

const STATUS_LABELS = Object.fromEntries(EMPLOYEE_STATUSES.map((s) => [s.value, s.label]));

export default function PayrollEmployeesPage() {
  const { companies, selectedCompanyId, isConsolidated } = useCompanyScope();
  const operational = companies.filter((c) => !c.is_holding);

  const [pickedCompanyId, setPickedCompanyId] = React.useState<string | null>(
    isConsolidated ? (operational[0]?.id ?? null) : selectedCompanyId,
  );
  React.useEffect(() => {
    if (!isConsolidated) setPickedCompanyId(selectedCompanyId);
  }, [isConsolidated, selectedCompanyId]);

  const companyId = pickedCompanyId;

  const [statusFilter, setStatusFilter] = React.useState<string>("active");
  const [search, setSearch] = React.useState("");

  const { data: rows = [], isLoading } = useEmployees({
    companyId: companyId ?? "",
    status: statusFilter === "" ? null : (statusFilter as Employee["status"]),
    search: search || null,
  });

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Employee | null>(null);

  const activeCount = rows.filter((r) => r.status === "active").length;
  const totalFolha = rows
    .filter((r) => r.status === "active")
    .reduce((s, r) => s + r.base_salary, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Colaboradores</h2>
          <p className="mt-1 text-sm text-text-muted">
            {activeCount} ativo(s){" "}
            {totalFolha > 0 && (
              <>
                · folha base mensal{" "}
                <span className="font-mono font-medium text-text">{formatBRL(totalFolha)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-end gap-2">
          {isConsolidated && operational.length > 0 && (
            <Select value={companyId ?? ""} onChange={(e) => setPickedCompanyId(e.target.value)}>
              {operational.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.trade_name ?? c.legal_name}
                </option>
              ))}
            </Select>
          )}
          <Button
            disabled={!companyId}
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="size-4" /> Novo colaborador
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" />
          <Input
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos os status</option>
          {EMPLOYEE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhum colaborador cadastrado.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60">
              <tr className="border-b border-border">
                <Th>Nome</Th>
                <Th>Cargo</Th>
                <Th>Tipo</Th>
                <Th>Admissão</Th>
                <Th align="right">Salário base</Th>
                <Th align="right">Status</Th>
                <Th align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-surface-2/50",
                    row.status !== "active" && "opacity-60",
                  )}
                >
                  <td className="px-4 py-3 font-medium">
                    {row.full_name}
                    {row.is_partner && (
                      <Badge tone="accent" className="ml-2">
                        Sócio
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{row.role ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-text-muted uppercase">
                    {row.employee_kind}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-subtle">{row.hire_date}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatBRL(row.base_salary)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge tone={row.status === "active" ? "income" : "default"}>
                      {STATUS_LABELS[row.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label="Ações"
                          className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-2 hover:text-text"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(row);
                            setDrawerOpen(true);
                          }}
                        >
                          <Pencil className="size-4" /> Editar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {companyId && (
        <EmployeeDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          employee={editing}
          companyId={companyId}
        />
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "text-2xs px-4 py-2.5 font-medium tracking-wide text-text-subtle uppercase",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
