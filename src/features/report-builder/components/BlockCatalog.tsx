/**
 * Painel de catálogo — blocos disponíveis, agrupados.
 *
 * Bloco incompatível com o escopo aparece **desabilitado com o motivo**, nunca
 * escondido: sumir com a opção faz o usuário procurar o que não existe.
 */
import { Plus } from "lucide-react";

import {
  BLOCK_GROUP_LABELS,
  BLOCK_GROUPS,
  blockAvailability,
  blockDefinitionsByGroup,
} from "@/features/report-builder/blocks/catalog";
import type {
  ReportBlockType,
  ReportComparison,
  ReportScopeMode,
} from "@/features/report-builder/schema";
import { cn } from "@/lib/cn";

interface Props {
  mode: ReportScopeMode;
  comparison: ReportComparison;
  onAdd: (type: ReportBlockType) => void;
}

export function BlockCatalog({ mode, comparison, onAdd }: Props) {
  return (
    <div className="space-y-5">
      {BLOCK_GROUPS.map((group) => {
        const definitions = blockDefinitionsByGroup(group);
        if (definitions.length === 0) return null;

        return (
          <section key={group} aria-labelledby={`grupo-${group}`}>
            <h3
              id={`grupo-${group}`}
              className="text-2xs mb-1.5 font-medium tracking-wide text-text-subtle uppercase"
            >
              {BLOCK_GROUP_LABELS[group]}
            </h3>
            <ul className="space-y-1">
              {definitions.map((definition) => {
                const availability = blockAvailability(definition.type, { mode, comparison });
                return (
                  <li key={definition.type}>
                    <BlockButton
                      label={definition.label}
                      description={definition.description}
                      disabled={!availability.available}
                      reason={availability.reason}
                      onClick={() => onAdd(definition.type)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface BlockButtonProps {
  label: string;
  description: string;
  disabled: boolean;
  reason?: string;
  onClick: () => void;
}

function BlockButton({ label, description, disabled, reason, onClick }: BlockButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? reason : description}
      className={cn(
        "group flex w-full items-start gap-2 rounded-[var(--radius-md)] border border-transparent px-2 py-1.5 text-left transition-colors duration-[var(--duration-fast)]",
        disabled
          ? "cursor-not-allowed opacity-45"
          : "hover:border-border hover:bg-surface-2 focus-visible:border-accent focus-visible:bg-surface-2",
      )}
    >
      <Plus
        className={cn(
          "mt-0.5 size-3.5 shrink-0 text-text-subtle",
          !disabled && "group-hover:text-accent",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-2xs block leading-snug text-text-subtle">
          {disabled ? reason : description}
        </span>
      </span>
    </button>
  );
}
