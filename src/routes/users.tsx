import * as React from "react";
import { MoreHorizontal, Pencil, Plus, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { roleLabel, usePermissions, type UserRole } from "@/features/auth/usePermissions";
import { useAllCompanies } from "@/features/companies/hooks";
import { useUsers, type UserWithAccess } from "@/features/users";
import { UserDrawer } from "@/features/users/components/UserDrawer";
import { cn } from "@/lib/cn";

const ROLE_TONE: Record<UserRole, "accent" | "income" | "info" | "default"> = {
  super_admin: "accent",
  admin: "income",
  editor: "info",
  viewer: "default",
};

export default function UsersPage() {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const { data: users = [], isLoading } = useUsers();
  const { data: companies = [] } = useAllCompanies();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserWithAccess | null>(null);

  const companyName = React.useMemo(
    () => new Map(companies.map((c) => [c.id, c.trade_name ?? c.legal_name])),
    [companies],
  );

  if (permsLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-expense-soft text-expense">
          <ShieldCheck className="size-5" />
        </div>
        <h2 className="mt-4 font-display text-lg font-semibold">Acesso restrito</h2>
        <p className="mt-1 text-sm text-text-muted">
          Apenas super administradores podem gerenciar usuários.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            <Users className="size-3 text-accent" />
            Administração
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Usuários</h1>
          <p className="mt-1 text-sm text-text-muted">
            Gerencie quem acessa o sistema, qual nível de permissão e quais empresas podem ver.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          <Plus className="size-4" /> Novo usuário
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhum usuário cadastrado.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60">
              <tr className="border-b border-border">
                <Th>Nome</Th>
                <Th>Email</Th>
                <Th>Nível</Th>
                <Th>Empresas</Th>
                <Th align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const role: UserRole = u.role ?? "viewer";
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="px-4 py-3 font-medium">{u.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{u.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={ROLE_TONE[role]}>{roleLabel(role)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {role === "super_admin" ? (
                        <span className="text-accent">Todas (super admin)</span>
                      ) : u.company_ids.length === 0 ? (
                        <span className="text-text-subtle">—</span>
                      ) : u.company_ids.length <= 2 ? (
                        u.company_ids.map((id) => companyName.get(id) ?? id.slice(0, 8)).join(", ")
                      ) : (
                        `${u.company_ids.length} empresas`
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
                              setEditing(u);
                              setDrawerOpen(true);
                            }}
                          >
                            <Pencil className="size-4" /> Editar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <UserDrawer open={drawerOpen} onOpenChange={setDrawerOpen} user={editing} />
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
