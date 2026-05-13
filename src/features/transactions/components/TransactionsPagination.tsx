import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";

interface Props {
  page: number;
  pageCount: number;
  totalCount: number;
  rowsOnPage: number;
  pageSize: number;
  inflowTotal: number;
  outflowTotal: number;
  onPageChange: (page: number) => void;
}

export function TransactionsPagination({
  page,
  pageCount,
  totalCount,
  rowsOnPage,
  pageSize,
  inflowTotal,
  outflowTotal,
  onPageChange,
}: Props) {
  const start = (page - 1) * pageSize + 1;
  const end = (page - 1) * pageSize + rowsOnPage;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-text-muted">
      <div className="flex items-center gap-4">
        <span>
          {totalCount === 0
            ? "0 resultados"
            : `${start}–${end} de ${totalCount.toLocaleString("pt-BR")}`}
        </span>
        <span className="hidden h-3 w-px bg-border sm:inline-block" />
        <span className="hidden items-center gap-3 sm:flex">
          <span className="font-mono text-income">↑ {formatBRL(inflowTotal)}</span>
          <span className="font-mono text-expense">↓ {formatBRL(outflowTotal)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" /> Anterior
        </Button>
        <span className="px-2 font-medium">
          {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
