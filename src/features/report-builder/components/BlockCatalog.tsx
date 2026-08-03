/**
 * Catálogo de blocos — faixa de chips agrupada.
 *
 * Era uma coluna com descrição de três linhas por bloco, o que rendia ~1400px de
 * altura para 16 blocos e empurrava a prévia para fora da tela. Escolher bloco é
 * ação pontual, não leitura: o chip mostra o rótulo e a descrição vai no `title`.
 *
 * Bloco incompatível com o escopo aparece **desabilitado**, nunca escondido —
 * sumir com a opção faz o usuário procurar o que não existe. O motivo vai no
 * `title` e, para não depender só de hover, num rodapé com a contagem.
 */
import { Lock, Plus } from "lucide-react";

import {
  BLOCK_GROUP_LABELS,
  BLOCK_GROUPS,
  blockAvailability,
  blockChipLabel,
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
  const unavailable = BLOCK_GROUPS.flatMap((group) => blockDefinitionsByGroup(group)).filter(
    (definition) => !blockAvailability(definition.type, { mode, comparison }).available,
  );

  return (
    <div className="space-y-3">
      {/*
        Fluxo único com o título do grupo em linha, não colunas nem grade: os
        grupos vão de 1 a 5 blocos, e qualquer layout em colunas deixa vazio sob
        os grupos pequenos (numa grade a célula assume a altura da maior; em
        colunas CSS, `break-inside-avoid` limita o equilíbrio ao maior grupo).
        Assim os 16 blocos ocupam ~4 linhas sem buraco algum.
      */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {BLOCK_GROUPS.map((group) => {
          const definitions = blockDefinitionsByGroup(group);
          if (definitions.length === 0) return null;

          return (
            <section
              key={group}
              aria-labelledby={`grupo-${group}`}
              className="flex flex-wrap items-center gap-1.5"
            >
              <h3
                id={`grupo-${group}`}
                className="text-2xs font-medium tracking-wide text-text-subtle uppercase"
              >
                {BLOCK_GROUP_LABELS[group]}
              </h3>
              <ul className="flex flex-wrap items-center gap-1.5">
                {definitions.map((definition) => {
                  const availability = blockAvailability(definition.type, { mode, comparison });
                  return (
                    <li key={definition.type}>
                      <BlockChip
                        label={blockChipLabel(definition)}
                        hint={availability.reason ?? definition.description}
                        disabled={!availability.available}
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

      {unavailable.length > 0 && (
        <p className="text-2xs flex items-start gap-1.5 border-t border-border pt-2.5 text-text-subtle">
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>
            {unavailable.length} bloco(s) indisponível(is) aqui:{" "}
            {unavailable.map((d) => d.label).join(", ")}.{" "}
            {mode === "consolidated"
              ? "Selecione uma empresa específica no seletor superior para liberá-los."
              : "Escolha um eixo de comparação para liberá-los."}
          </span>
        </p>
      )}
    </div>
  );
}

interface BlockChipProps {
  label: string;
  hint: string;
  disabled: boolean;
  onClick: () => void;
}

function BlockChip({ label, hint, disabled, onClick }: BlockChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={cn(
        // `whitespace-nowrap`: rótulos como "Receita bruta — ano vs. ano" quebram
        // em duas linhas e deixam a faixa de chips irregular.
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)]",
        disabled
          ? "cursor-not-allowed border-border/60 text-text-subtle opacity-55"
          : "border-border text-text hover:border-accent hover:bg-accent-soft hover:text-accent focus-visible:border-accent focus-visible:bg-accent-soft",
      )}
    >
      {disabled ? (
        <Lock className="size-3 shrink-0" aria-hidden />
      ) : (
        <Plus className="size-3 shrink-0" aria-hidden />
      )}
      {label}
    </button>
  );
}
