import { Loader2, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  selectedCount: number;
  /** Total que bate com o filtro atual, não só o da página. */
  totalCount: number;
  onSelectAllMatching: () => void;
  selectingAll: boolean;
  onClear: () => void;
  onEdit: () => void;
  limit: number;
}

export function BulkActionsBar({
  selectedCount,
  totalCount,
  onSelectAllMatching,
  selectingAll,
  onClear,
  onEdit,
  limit,
}: Props) {
  if (selectedCount === 0) return null;

  const canSelectAll = selectedCount < totalCount && totalCount <= limit;
  const exceedsLimit = totalCount > limit;

  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-accent/40 bg-surface p-3 shadow-[var(--shadow-md)]">
      <span className="text-sm font-medium">
        {selectedCount.toLocaleString("pt-BR")} selecionado(s)
      </span>

      {canSelectAll && (
        <Button variant="ghost" size="sm" onClick={onSelectAllMatching} disabled={selectingAll}>
          {selectingAll && <Loader2 className="size-3.5 animate-spin" />}
          Selecionar todos os {totalCount.toLocaleString("pt-BR")} do filtro
        </Button>
      )}

      {exceedsLimit && selectedCount < totalCount && (
        <span className="text-2xs text-text-subtle">
          O filtro tem {totalCount.toLocaleString("pt-BR")} lançamentos — a edição em massa cobre{" "}
          {limit.toLocaleString("pt-BR")} por vez. Refine o filtro para selecionar tudo.
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="size-3.5" /> Limpar seleção
        </Button>
        <Button size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" /> Editar em massa
        </Button>
      </div>
    </div>
  );
}
