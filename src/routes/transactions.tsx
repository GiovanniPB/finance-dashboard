import * as React from "react";
import { Plus } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { TransactionDrawer } from "@/features/transactions/components/TransactionDrawer";
import { TransactionsFilters } from "@/features/transactions/components/TransactionsFilters";
import { TransactionsPagination } from "@/features/transactions/components/TransactionsPagination";
import { TransactionsTable } from "@/features/transactions/components/TransactionsTable";
import {
  useRestoreTransaction,
  useSoftDeleteTransaction,
  useTransactions,
} from "@/features/transactions/hooks";
import type { TransactionWithRelations } from "@/features/transactions/types";
import { useTransactionFilters } from "@/features/transactions/useTransactionFilters";

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const { selectedCompanyId, isConsolidated, selectedCompany, companies } = useCompanyScope();
  const [filters, setFilters] = useTransactionFilters();
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TransactionWithRelations | null>(null);

  const companyId = isConsolidated ? null : selectedCompanyId;

  // No modo consolidado, abrir o drawer de criar requer escolher uma empresa
  const drawerCompanyId = companyId ?? companies.find((c) => !c.is_holding)?.id ?? null;

  const { data, isLoading, isFetching } = useTransactions({
    companyId,
    from: filters.from || null,
    to: filters.to || null,
    status: filters.status ? [filters.status] : undefined,
    direction: filters.direction,
    accountId: filters.accountId || null,
    search: filters.search || null,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    page,
    pageSize: PAGE_SIZE,
  });

  const softDelete = useSoftDeleteTransaction();
  const restore = useRestoreTransaction();

  const handleEdit = React.useCallback((t: TransactionWithRelations) => {
    setEditing(t);
    setDrawerOpen(true);
  }, []);

  const handleNew = React.useCallback(() => {
    setEditing(null);
    setDrawerOpen(true);
  }, []);

  const handleDelete = React.useCallback(
    (t: TransactionWithRelations) => {
      softDelete.mutate(t.id, {
        onSuccess: () => {
          toast("Lançamento excluído", {
            description: t.description,
            action: {
              label: "Desfazer",
              onClick: () => {
                restore.mutate(t.id, {
                  onSuccess: () => {
                    toast.success("Lançamento restaurado");
                  },
                });
              },
            },
          });
        },
        onError: (err) => {
          toast.error("Erro ao excluir", { description: err.message });
        },
      });
    },
    [softDelete, restore],
  );

  // Atalho de teclado: N para novo lançamento
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      handleNew();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [handleNew]);

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xs flex items-center gap-2 font-medium tracking-wide text-text-subtle uppercase">
            Lançamentos
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {isConsolidated
              ? "Todas as empresas"
              : (selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {data?.totalCount !== undefined
              ? `${data.totalCount.toLocaleString("pt-BR")} lançamento(s) no escopo selecionado`
              : "Carregando…"}
            {isFetching && !isLoading && (
              <Badge tone="info" className="ml-3">
                Atualizando
              </Badge>
            )}
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="size-4" />
          Novo lançamento
          <kbd className="ml-2 hidden rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] sm:inline">
            N
          </kbd>
        </Button>
      </div>

      <TransactionsFilters companyId={companyId} />

      <TransactionsTable
        rows={data?.rows ?? []}
        loading={isLoading}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        onSortChange={(sortBy, sortOrder) =>
          void setFilters({
            sortBy: sortBy as typeof filters.sortBy,
            sortOrder,
          })
        }
        showCompany={isConsolidated}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <TransactionsPagination
        page={page}
        pageCount={data?.pageCount ?? 1}
        totalCount={data?.totalCount ?? 0}
        rowsOnPage={data?.rows.length ?? 0}
        pageSize={PAGE_SIZE}
        inflowTotal={data?.inflowTotal ?? 0}
        outflowTotal={data?.outflowTotal ?? 0}
        onPageChange={(p) => void setPage(p)}
      />

      <TransactionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        transaction={editing}
        companyId={drawerCompanyId}
      />
    </div>
  );
}
