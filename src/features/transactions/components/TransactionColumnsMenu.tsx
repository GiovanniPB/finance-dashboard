import { ArrowDown, ArrowUp, Columns3, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

import { columnLabel } from "../columns";

interface Props {
  /** Ids das colunas, na ordem efetiva do escopo atual. */
  order: string[];
  isHidden: (id: string) => boolean;
  onToggle: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReset: () => void;
}

export function TransactionColumnsMenu({ order, isHidden, onToggle, onMove, onReset }: Props) {
  const visibleCount = order.filter((id) => !isHidden(id)).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 className="size-3.5" /> Colunas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
            Colunas
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-2xs inline-flex items-center gap-1 text-text-muted transition-colors hover:text-text"
          >
            <RotateCcw className="size-3" /> Padrão
          </button>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto p-1.5">
          {order.map((id, index) => {
            const hidden = isHidden(id);
            const isLastVisible = !hidden && visibleCount <= 1;
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-surface-2"
              >
                <Checkbox
                  id={`col-${id}`}
                  checked={!hidden}
                  disabled={isLastVisible}
                  onCheckedChange={() => {
                    onToggle(id);
                  }}
                />
                <label
                  htmlFor={`col-${id}`}
                  className={cn(
                    "flex-1 cursor-pointer truncate text-sm select-none",
                    hidden ? "text-text-subtle" : "text-text",
                  )}
                >
                  {columnLabel(id)}
                </label>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={`Mover ${columnLabel(id)} para cima`}
                    disabled={index === 0}
                    onClick={() => {
                      onMove(id, -1);
                    }}
                    className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-3 hover:text-text disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover ${columnLabel(id)} para baixo`}
                    disabled={index === order.length - 1}
                    onClick={() => {
                      onMove(id, 1);
                    }}
                    className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-3 hover:text-text disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
