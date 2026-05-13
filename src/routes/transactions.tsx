import { Plus } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { TransactionsFilters } from "@/features/transactions/components/TransactionsFilters";
import { TransactionsPagination } from "@/features/transactions/components/TransactionsPagination";
import { TransactionsTable } from "@/features/transactions/components/TransactionsTable";
import { useTransactions } from "@/features/transactions/hooks";
import { useTransactionFilters } from "@/features/transactions/useTransactionFilters";

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const { selectedCompanyId, isConsolidated, selectedCompany } = useCompanyScope();
  const [filters, setFilters] = useTransactionFilters();
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const companyId = isConsolidated ? null : selectedCompanyId;

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
        <Button disabled title="Em breve">
          <Plus className="size-4" /> Novo lançamento
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
    </div>
  );
}
