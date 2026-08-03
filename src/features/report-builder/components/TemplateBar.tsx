/**
 * Barra de templates salvos.
 *
 * Convive com os modelos de fábrica (`presets.ts`): fábrica é ponto de partida,
 * template é o que a empresa criou e reexecuta todo mês. Template cuja `config`
 * não passa no schema atual aparece **desabilitado e marcado**, em vez de sumir —
 * sumir esconderia trabalho salvo do usuário.
 */
import * as React from "react";
import { AlertTriangle, Building2, Check, Globe2, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReportTemplate } from "@/features/report-builder/hooks";
import { cn } from "@/lib/cn";

interface Props {
  templates: readonly ReportTemplate[];
  isLoading: boolean;
  /** Template atualmente carregado, para destacar e permitir "salvar por cima". */
  activeId: string | null;
  isSaving: boolean;
  /** `undefined` = pode salvar; string = motivo do bloqueio. */
  disabledReason?: string;
  onLoad: (template: ReportTemplate) => void;
  onCreate: (name: string) => void;
  onOverwrite: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateBar({
  templates,
  isLoading,
  activeId,
  isSaving,
  disabledReason,
  onLoad,
  onCreate,
  onOverwrite,
  onDelete,
}: Props) {
  const [name, setName] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<ReportTemplate | null>(null);

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && disabledReason == null && !isSaving;

  function handleCreate() {
    if (!canCreate) return;
    onCreate(trimmed);
    setName("");
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
          Templates salvos
        </span>

        {isLoading ? (
          <span className="text-2xs text-text-subtle">carregando…</span>
        ) : templates.length === 0 ? (
          <span className="text-2xs text-text-subtle">
            nenhum ainda — monte o relatório e salve abaixo
          </span>
        ) : (
          <ul className="flex flex-wrap items-center gap-1.5">
            {templates.map((template) => {
              const broken = template.config == null;
              const active = template.id === activeId;
              return (
                <li key={template.id} className="flex items-center">
                  <button
                    type="button"
                    disabled={broken}
                    title={
                      broken
                        ? "A configuração salva não é compatível com a versão atual do relatório."
                        : (template.description ?? template.name)
                    }
                    onClick={() => onLoad(template)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-l-full border py-1 pr-2 pl-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)]",
                      broken
                        ? "cursor-not-allowed border-warning/40 text-warning opacity-70"
                        : active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border text-text hover:border-accent hover:bg-accent-soft hover:text-accent",
                    )}
                  >
                    {broken ? (
                      <AlertTriangle className="size-3 shrink-0" aria-hidden />
                    ) : template.companyId == null ? (
                      <Globe2 className="size-3 shrink-0" aria-hidden />
                    ) : (
                      <Building2 className="size-3 shrink-0" aria-hidden />
                    )}
                    {template.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir template ${template.name}`}
                    title={`Excluir template ${template.name}`}
                    onClick={() => setPendingDelete(template)}
                    className="inline-flex items-center rounded-r-full border border-l-0 border-border px-1.5 py-1 text-text-subtle transition-colors duration-[var(--duration-fast)] hover:border-expense hover:bg-expense-soft hover:text-expense"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <Label htmlFor="rb-template-name">Salvar composição atual como</Label>
          <Input
            id="rb-template-name"
            value={name}
            placeholder="Ex.: Mensal Diretoria"
            maxLength={120}
            disabled={disabledReason != null}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={handleCreate}
          disabled={!canCreate}
          title={disabledReason}
        >
          <Save className="size-3.5" /> Salvar novo
        </Button>
        {activeId != null && (
          <Button
            variant="outline"
            size="md"
            onClick={() => onOverwrite(activeId)}
            disabled={isSaving || disabledReason != null}
            title={disabledReason ?? "Grava a composição atual sobre o template carregado"}
          >
            <Check className="size-3.5" /> Atualizar carregado
          </Button>
        )}
      </div>

      {disabledReason != null && <p className="text-2xs text-text-subtle">{disabledReason}</p>}

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Excluir template"
        description={`"${pendingDelete?.name ?? ""}" será removido. Os relatórios já gerados não são afetados.`}
        confirmLabel="Excluir"
        onConfirm={() => {
          if (pendingDelete != null) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
