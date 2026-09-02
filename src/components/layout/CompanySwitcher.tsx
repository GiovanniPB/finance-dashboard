import * as React from "react";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Globe2,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/features/auth/usePermissions";
import {
  CONSOLIDATED_KEY,
  groupScopeKey,
  useCompanyScope,
} from "@/features/companies/CompanyContext";
import type { CompanyGroup } from "@/features/company-groups/api";
import { CompanyGroupDrawer } from "@/features/company-groups/components/CompanyGroupDrawer";
import { useDeleteCompanyGroup } from "@/features/company-groups/hooks";

export function CompanySwitcher() {
  const {
    companies,
    operationalCompanies,
    groups,
    scopeKind,
    scopeKey,
    setScope,
    scopeLabel,
    scopeCompanies,
    loading,
  } = useCompanyScope();
  const { canEdit } = usePermissions();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<CompanyGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = React.useState<CompanyGroup | null>(null);
  const remove = useDeleteCompanyGroup();

  const organizationId = companies[0]?.organization_id ?? null;

  function openNewGroup() {
    setEditingGroup(null);
    setDrawerOpen(true);
  }

  function openEditGroup(group: CompanyGroup) {
    setEditingGroup(group);
    setDrawerOpen(true);
  }

  function confirmDelete() {
    const group = deletingGroup;
    if (!group) return;
    remove.mutate(group.id, {
      onSuccess: () => {
        toast.success("Grupo excluído");
        // O escopo aponta para um grupo que deixou de existir: volta para o consolidado
        // em vez de ficar exibindo o rótulo de um recorte que não é mais aplicado.
        if (scopeKey === groupScopeKey(group.id)) setScope(CONSOLIDATED_KEY);
        setDeletingGroup(null);
      },
      onError: (err) => toast.error("Não foi possível excluir", { description: err.message }),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            disabled={loading}
            className="group flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm font-medium transition-colors hover:border-border-strong disabled:opacity-50"
          >
            <ScopeIcon kind={scopeKind} />
            <span className="max-w-[200px] truncate">{scopeLabel}</span>
            {scopeKind === "group" && (
              <span className="text-2xs rounded-full bg-accent-soft px-1.5 py-0.5 text-accent">
                {scopeCompanies.length}
              </span>
            )}
            <ChevronsUpDown className="size-3.5 text-text-subtle transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="min-w-[280px]">
          <DropdownMenuLabel>Visualizar</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setScope(CONSOLIDATED_KEY)}>
            <Globe2 className="size-4 text-accent" />
            <span className="flex-1">Consolidado</span>
            {scopeKind === "consolidated" && <Check className="size-4 text-accent" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span>Grupos</span>
            {canEdit && organizationId && (
              <button
                type="button"
                onClick={(e) => {
                  // O item de menu fecharia o dropdown antes do clique registrar.
                  e.preventDefault();
                  e.stopPropagation();
                  openNewGroup();
                }}
                className="text-2xs inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1 py-0.5 font-medium text-accent hover:bg-accent-soft"
              >
                <Plus className="size-3" /> Novo
              </button>
            )}
          </DropdownMenuLabel>

          {groups.length === 0 ? (
            <p className="text-2xs px-2 py-1.5 text-text-subtle">
              Nenhum grupo ainda. Um grupo soma só as empresas que você escolher.
            </p>
          ) : (
            groups.map((g) => (
              <DropdownMenuItem key={g.id} onSelect={() => setScope(groupScopeKey(g.id))}>
                <Layers className="size-4 text-accent" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{g.name}</span>
                  <span className="text-2xs truncate text-text-subtle">
                    {g.companyIds.length} empresas
                    {g.description ? ` · ${g.description}` : ""}
                  </span>
                </div>
                {scopeKey === groupScopeKey(g.id) && <Check className="size-4 text-accent" />}
                {canEdit && (
                  <span className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`Editar ${g.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openEditGroup(g);
                      }}
                      className="rounded-[var(--radius-sm)] p-1 text-text-subtle hover:bg-surface-2 hover:text-text"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${g.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeletingGroup(g);
                      }}
                      className="rounded-[var(--radius-sm)] p-1 text-text-subtle hover:bg-surface-2 hover:text-expense"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Empresas</DropdownMenuLabel>
          {operationalCompanies.map((c) => (
            <DropdownMenuItem key={c.id} onSelect={() => setScope(c.id)}>
              <Building2 className="size-4 text-text-muted" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{c.trade_name ?? c.legal_name}</span>
                {c.trade_name && c.legal_name !== c.trade_name && (
                  <span className="text-2xs truncate text-text-subtle">{c.legal_name}</span>
                )}
              </div>
              {scopeKey === c.id && <Check className="size-4 text-accent" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {organizationId && (
        <CompanyGroupDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          group={editingGroup}
          organizationId={organizationId}
          companies={operationalCompanies}
        />
      )}

      <ConfirmDialog
        open={Boolean(deletingGroup)}
        onOpenChange={(open) => !open && setDeletingGroup(null)}
        title="Excluir grupo"
        description={
          <>
            O grupo <strong>{deletingGroup?.name}</strong> deixa de aparecer no seletor. Nenhum
            lançamento é afetado — grupo é só um recorte de visualização.
          </>
        }
        confirmLabel="Excluir"
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function ScopeIcon({ kind }: { kind: "company" | "consolidated" | "group" }) {
  if (kind === "consolidated") return <Globe2 className="size-4 text-accent" />;
  if (kind === "group") return <Layers className="size-4 text-accent" />;
  return <Building2 className="size-4 text-text-muted" />;
}
