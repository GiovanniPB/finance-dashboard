import * as React from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import { cn } from "@/lib/cn";

import type { ChartAccount } from "../api";
import { useChartAccounts, useDeleteChartAccount } from "../hooks";
import { accountKindLabel, DRE_SECTIONS } from "../schema";
import { ChartAccountDrawer } from "./ChartAccountDrawer";

interface Props {
  companyId: string;
}

export function ChartAccountManager({ companyId }: Props) {
  const { canEdit } = usePermissions();
  const { data: accounts = [], isLoading } = useChartAccounts(companyId);
  const deleteMutation = useDeleteChartAccount();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ChartAccount | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ChartAccount | null>(null);

  const grouped = React.useMemo(() => {
    const map = new Map<string, ChartAccount[]>();
    for (const a of accounts) {
      const key = a.dre_section ?? "__null__";
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [accounts]);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (account: ChartAccount) => {
    setEditing(account);
    setDrawerOpen(true);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteMutation.mutate(confirmDelete.id, {
      onSuccess: () => {
        toast.success("Conta excluída");
        setConfirmDelete(null);
      },
      onError: (err) => toast.error("Erro ao excluir", { description: err.message }),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm text-text-muted">
          {accounts.length} conta(s) · Contas do plano padrão (
          <Lock className="inline size-3" />) não podem ser excluídas, mas podem ser editadas.
        </p>
        {canEdit && (
          <Button onClick={openCreate} size="sm">
            <Plus className="size-4" /> Nova conta
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {DRE_SECTIONS.map((section) => {
          const rows = grouped.get(section.value) ?? [];
          if (rows.length === 0) return null;
          return (
            <Card key={section.value}>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="text-2xs font-semibold tracking-wide text-text uppercase">
                    {section.label}
                  </div>
                  <Badge tone="info">{rows.length}</Badge>
                </div>
                <ul className="divide-y divide-border">
                  {rows.map((a) => (
                    <AccountRow
                      key={a.id}
                      account={a}
                      canEdit={canEdit}
                      onEdit={() => openEdit(a)}
                      onDelete={() => setConfirmDelete(a)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}

        {grouped.has("__null__") && (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="text-2xs font-semibold tracking-wide text-text uppercase">
                  Sem seção DRE
                </div>
                <Badge>{grouped.get("__null__")?.length}</Badge>
              </div>
              <ul className="divide-y divide-border">
                {grouped.get("__null__")?.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    canEdit={canEdit}
                    onEdit={() => openEdit(a)}
                    onDelete={() => setConfirmDelete(a)}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <ChartAccountDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        account={editing}
        companyId={companyId}
        allAccounts={accounts}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Excluir conta DRE"
        description={
          <>
            Tem certeza que deseja excluir <strong>{confirmDelete?.name}</strong>? Esta ação não
            pode ser desfeita. Contas com lançamentos ou sub-contas não podem ser excluídas.
          </>
        }
        confirmLabel="Excluir"
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

interface AccountRowProps {
  account: ChartAccount;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function AccountRow({ account, canEdit, onEdit, onDelete }: AccountRowProps) {
  const isSystem = Boolean(account.master_account_id);
  const isChild = Boolean(account.parent_id);
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm",
        !account.is_active && "opacity-60",
      )}
    >
      <span className={cn("min-w-[80px] font-mono text-xs text-text-subtle", isChild && "pl-4")}>
        {account.code}
      </span>
      <span className="flex-1 truncate">
        {account.name}
        {account.is_summary && (
          <Badge tone="info" className="ml-2">
            Subtotal
          </Badge>
        )}
        {!account.is_active && <Badge className="ml-2">Inativa</Badge>}
      </span>
      <span className="text-2xs hidden text-text-subtle sm:inline">
        {accountKindLabel(account.kind)}
      </span>
      {isSystem ? (
        <span
          className="text-2xs inline-flex items-center gap-1 text-text-subtle"
          title="Conta padrão (não pode ser excluída)"
        >
          <Lock className="size-3" />
        </span>
      ) : (
        <span className="w-3" />
      )}
      <div className="flex items-center gap-1">
        {canEdit && (
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Editar">
            <Pencil className="size-3.5" />
          </Button>
        )}
        {canEdit && !isSystem && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Excluir"
            className="text-expense hover:bg-expense-soft hover:text-expense"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}
