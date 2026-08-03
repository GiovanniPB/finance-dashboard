/**
 * Painel de composição — a ordem em que os blocos entram no PDF.
 *
 * Reordenação por botões **e** por arrastar. Os botões não são redundância: são o
 * único caminho operável por teclado, e arrastar sozinho deixaria a ferramenta
 * inacessível.
 */
import * as React from "react";
import { ChevronDown, ChevronUp, GripVertical, Settings2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBlockDefinition } from "@/features/report-builder/blocks/catalog";
import type { BlockOptions, ReportBlock } from "@/features/report-builder/schema";
import { cn } from "@/lib/cn";

import { BlockOptionsEditor } from "./BlockOptionsEditor";

interface Props {
  blocks: readonly ReportBlock[];
  onRemove: (instanceId: string) => void;
  onMove: (instanceId: string, direction: "up" | "down") => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onOptionsChange: (instanceId: string, patch: Partial<BlockOptions>) => void;
}

export function BlockComposition({ blocks, onRemove, onMove, onReorder, onOptionsChange }: Props) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  if (blocks.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center">
        <p className="text-sm text-text-muted">Nenhum bloco na composição.</p>
        <p className="text-2xs mt-1 text-text-subtle">
          Escolha um modelo pronto acima ou adicione blocos pelo catálogo.
        </p>
      </div>
    );
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex != null && dragIndex !== targetIndex) onReorder(dragIndex, targetIndex);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <ol className="space-y-1.5">
      {blocks.map((block, index) => {
        const definition = getBlockDefinition(block.type);
        const isExpanded = expanded === block.instanceId;
        const hasOptions = (definition.options ?? []).length > 0;

        return (
          <li
            key={block.instanceId}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(index);
            }}
            onDrop={() => handleDrop(index)}
            className={cn(
              "rounded-[var(--radius-md)] border bg-surface transition-colors duration-[var(--duration-fast)]",
              overIndex === index && dragIndex !== index
                ? "border-accent bg-accent-soft/40"
                : "border-border",
              dragIndex === index && "opacity-50",
            )}
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <GripVertical
                aria-hidden
                className="size-3.5 shrink-0 cursor-grab text-text-subtle"
              />
              <span className="text-2xs w-4 shrink-0 text-right font-mono text-text-subtle">
                {index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {block.options.heading ?? definition.label}
                </span>
              </span>

              {definition.type === "page-break" && (
                <Badge tone="default" className="shrink-0">
                  quebra
                </Badge>
              )}

              <div className="flex shrink-0 items-center">
                <IconButton
                  label={`Mover ${definition.label} para cima`}
                  disabled={index === 0}
                  onClick={() => onMove(block.instanceId, "up")}
                >
                  <ChevronUp className="size-3.5" />
                </IconButton>
                <IconButton
                  label={`Mover ${definition.label} para baixo`}
                  disabled={index === blocks.length - 1}
                  onClick={() => onMove(block.instanceId, "down")}
                >
                  <ChevronDown className="size-3.5" />
                </IconButton>
                {hasOptions && (
                  <IconButton
                    label={`Opções de ${definition.label}`}
                    active={isExpanded}
                    onClick={() => setExpanded(isExpanded ? null : block.instanceId)}
                  >
                    <Settings2 className="size-3.5" />
                  </IconButton>
                )}
                <IconButton
                  label={`Remover ${definition.label}`}
                  onClick={() => onRemove(block.instanceId)}
                >
                  <X className="size-3.5" />
                </IconButton>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-border px-3 py-3">
                <BlockOptionsEditor
                  block={block}
                  onChange={(patch) => onOptionsChange(block.instanceId, patch)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

function IconButton({ label, onClick, disabled, active, children }: IconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("size-7", active && "text-accent")}
    >
      {children}
    </Button>
  );
}
