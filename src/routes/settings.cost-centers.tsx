import * as React from "react";
import { MoreHorizontal, Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSingleCompanyPicker } from "@/features/companies/useSingleCompanyPicker";
import { type CostCenter } from "@/features/cost-centers/api";
import { CostCenterDrawer } from "@/features/cost-centers/components/CostCenterDrawer";
import { useCostCenters } from "@/features/cost-centers/hooks";
import { cn } from "@/lib/cn";

export default function SettingsCostCentersPage() {
  // Tela que OPERA numa empresa: num escopo com várias (consolidado ou grupo de
  // agregação), escolhe-se qual — sempre entre as empresas do escopo.
  const {
    companyId,
    setCompanyId,
    options: scopeCompanies,
    needsPicker,
  } = useSingleCompanyPicker();
  const { data: rows = [], isLoading } = useCostCenters(companyId);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CostCenter | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Centros de custo</h2>
          <p className="mt-1 text-sm text-text-muted">
            Departamentos, filiais ou projetos para classificar despesas.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {needsPicker && (
            <Select value={companyId ?? undefined} onValueChange={(v) => setCompanyId(v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {scopeCompanies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.trade_name ?? c.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            disabled={!companyId}
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="size-4" /> Novo
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhum centro de custo cadastrado.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60">
              <tr className="border-b border-border">
                <Th>Nome</Th>
                <Th>Descrição</Th>
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
                    !row.is_active && "opacity-60",
                  )}
                >
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="max-w-[400px] truncate px-4 py-3 text-text-muted">
                    {row.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.is_active ? (
                      <Badge tone="income">Ativo</Badge>
                    ) : (
                      <Badge tone="default">Inativo</Badge>
                    )}
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
        <CostCenterDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          costCenter={editing}
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
