import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const BILLS_PAGE_SIZES = [20, 50, 100, 200] as const;
export const DEFAULT_BILLS_PAGE_SIZE = 20;

interface Props {
  page: number;
  pageCount: number;
  totalCount: number;
  rowsOnPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function BillsPagination({
  page,
  pageCount,
  totalCount,
  rowsOnPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const start = (page - 1) * pageSize + 1;
  const end = (page - 1) * pageSize + rowsOnPage;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-text-muted">
      <div className="flex items-center gap-3">
        <span>
          {totalCount === 0
            ? "0 títulos"
            : `${start}–${end} de ${totalCount.toLocaleString("pt-BR")}`}
        </span>
        <span className="hidden h-3 w-px bg-border sm:inline-block" />
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Por página</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-20" aria-label="Títulos por página">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLS_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
          {page} / {Math.max(pageCount, 1)}
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
