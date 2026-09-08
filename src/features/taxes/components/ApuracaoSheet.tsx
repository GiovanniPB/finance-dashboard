import * as React from "react";
import { CheckCircle2, Loader2, Lock, Plus, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/dates";

import type { TaxObligationKind } from "../api";
import { computeAssessment, type InputLine, type LineKind } from "../apuracao";
import { KIND_META, LINE_KIND_META, PERIOD_KIND_META, periodLabel } from "../constants";
import {
  useAssessmentInputs,
  useConfirmAssessment,
  useReopenAssessment,
  useSaveAssessment,
} from "../hooks";
import { ApuracaoResumo } from "./ApuracaoResumo";
import { DemonstrativoTable } from "./DemonstrativoTable";

/**
 * Apuração de um tributo num período.
 *
 * O ciclo é: o banco colhe a base sob RLS, o motor compartilhado faz a conta, e o
 * banco grava conferindo a coerência. As linhas MANUAIS (retenção sofrida, outras
 * deduções, saldo anterior) vivem no estado local até salvar e sobrevivem ao
 * recálculo — sem isso, reapertar "Recalcular" apagaria a retenção digitada e o
 * imposto subiria em silêncio.
 */

/** Seções que se digitam à mão: o resto vem dos lançamentos. */
const MANUAL_KINDS: LineKind[] = ["retention", "deduction", "addition", "carryforward"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  companyName: string;
  kind: TaxObligationKind | null;
  periodDate: string | null;
}

export function ApuracaoSheet({
  open,
  onOpenChange,
  companyId,
  companyName,
  kind,
  periodDate,
}: Props) {
  const query = useAssessmentInputs(open ? companyId : null, kind, periodDate);
  const saveMutation = useSaveAssessment();
  const confirmMutation = useConfirmAssessment();
  const reopenMutation = useReopenAssessment();

  const [manualLines, setManualLines] = React.useState<InputLine[]>([]);
  const [dirty, setDirty] = React.useState(false);

  // Ao abrir uma competência nova, as manuais vêm do banco (se a apuração já existe).
  const inputsKey = query.data
    ? `${query.data.company_id}-${query.data.kind}-${query.data.period_start}`
    : null;
  const loadedKey = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (inputsKey && inputsKey !== loadedKey.current && query.data) {
      loadedKey.current = inputsKey;
      setManualLines(query.data.manual_lines ?? []);
      setDirty(false);
    }
  }, [inputsKey, query.data]);

  const result = React.useMemo(() => {
    if (!query.data) return null;
    try {
      return computeAssessment({ ...query.data, manual_lines: manualLines });
    } catch (err) {
      toast.error("Não consegui apurar", {
        description: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }, [query.data, manualLines]);

  const assessment = query.data?.assessment ?? null;
  const isConfirmed = assessment?.status === "confirmed";
  const busy = saveMutation.isPending || confirmMutation.isPending || reopenMutation.isPending;

  function addManual(line: InputLine) {
    setManualLines((prev) => [...prev, line]);
    setDirty(true);
  }

  function removeManual(index: number) {
    setManualLines((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  async function handleSave(): Promise<string | null> {
    if (!result) return null;
    try {
      const saved = await saveMutation.mutateAsync(result);
      setDirty(false);
      return saved.id;
    } catch (err) {
      toast.error("Erro ao salvar a apuração", {
        description: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" className="w-[min(56rem,100vw)] sm:max-w-none">
        <SheetHeader>
          <SheetTitle>
            {kind ? KIND_META[kind].label : "Apuração"}
            {query.data && (
              <span className="ml-2 text-sm font-normal text-text-muted">
                {periodLabel(query.data.period_start, query.data.period_kind)}
              </span>
            )}
          </SheetTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span>{companyName}</span>
            {query.data && (
              <>
                <span aria-hidden>·</span>
                <Badge tone="info">{PERIOD_KIND_META[query.data.period_kind].label}</Badge>
                <span aria-hidden>·</span>
                <span>
                  {formatDate(query.data.period_start)} a {formatDate(query.data.period_end)}
                </span>
              </>
            )}
            {isConfirmed && (
              <Badge tone="income">
                <Lock className="mr-1 size-3" /> Confirmada
              </Badge>
            )}
          </div>
        </SheetHeader>

        <SheetBody className="min-h-0 space-y-4">
          {query.isLoading && <Skeleton className="h-72 w-full" />}

          {query.isError && (
            <div className="rounded-[var(--radius-md)] border border-expense bg-expense-soft p-4 text-sm">
              <strong className="text-expense">Não há regra para apurar</strong>
              <p className="mt-1 text-text-muted">
                {query.error instanceof Error ? query.error.message : String(query.error)}
              </p>
            </div>
          )}

          {result && (
            <>
              <ApuracaoResumo result={result} />

              {!isConfirmed && (
                <ManualLineForm
                  onAdd={addManual}
                  deductsRetentions={query.data?.rule.deducts_retentions ?? false}
                />
              )}

              <div>
                <h3 className="text-2xs mb-2 font-semibold tracking-wide text-text-subtle uppercase">
                  Demonstrativo da base de cálculo
                </h3>
                <DemonstrativoTable
                  lines={result.lines}
                  onRemoveManual={
                    isConfirmed
                      ? undefined
                      : (line) => {
                          const idx = manualLines.findIndex(
                            (m) =>
                              m.line_kind === line.line_kind &&
                              m.description === line.description &&
                              m.amount === line.amount,
                          );
                          if (idx >= 0) removeManual(idx);
                        }
                  }
                />
              </div>
            </>
          )}
        </SheetBody>

        <SheetFooter className="flex-wrap">
          {dirty && <span className="mr-auto text-xs text-warning">Há alterações não salvas</span>}

          {isConfirmed ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (!assessment) return;
                reopenMutation.mutate(assessment.id, {
                  onSuccess: () => {
                    toast.success("Apuração reaberta");
                    void query.refetch();
                  },
                  onError: (err) =>
                    toast.error("Não foi possível reabrir", { description: err.message }),
                });
              }}
            >
              {reopenMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Reabrir
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={busy || !result}
                onClick={() => {
                  void handleSave().then((id) => {
                    if (id) toast.success("Rascunho salvo");
                  });
                }}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Salvar rascunho
              </Button>
              <Button
                disabled={busy || !result}
                onClick={() => {
                  void handleSave().then((id) => {
                    if (!id) return;
                    confirmMutation.mutate(id, {
                      onSuccess: (ob) => {
                        toast.success("Apuração confirmada", {
                          description: `Obrigação de ${formatDate(ob.due_date)} criada em aberto.`,
                        });
                        void query.refetch();
                      },
                      onError: (err) =>
                        toast.error("Erro ao confirmar", { description: err.message }),
                    });
                  });
                }}
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Confirmar e gerar obrigação
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Retenção sofrida, outras deduções, acréscimos e saldo anterior — o que se digita. */
function ManualLineForm({
  onAdd,
  deductsRetentions,
}: {
  onAdd: (line: InputLine) => void;
  deductsRetentions: boolean;
}) {
  const [lineKind, setLineKind] = React.useState<LineKind>(
    deductsRetentions ? "retention" : "deduction",
  );
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState(0);

  const canAdd = description.trim().length > 0 && amount !== 0;

  return (
    <form
      className="grid grid-cols-1 items-end gap-2 rounded-[var(--radius-md)] border border-dashed border-border p-3 sm:grid-cols-[11rem_1fr_9rem_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canAdd) return;
        onAdd({ line_kind: lineKind, description: description.trim(), amount });
        setDescription("");
        setAmount(0);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="manual-kind" className="text-2xs">
          Seção
        </Label>
        <Select value={lineKind} onValueChange={(v) => setLineKind(v as LineKind)}>
          <SelectTrigger id="manual-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MANUAL_KINDS.map((k) => (
              <SelectItem key={k} value={k} disabled={k === "retention" && !deductsRetentions}>
                {LINE_KIND_META[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="manual-desc" className="text-2xs">
          Descrição
        </Label>
        <Input
          id="manual-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ex.: IRRF retido na NF do BTG Pactual"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="manual-amount" className="text-2xs">
          Valor
        </Label>
        <CurrencyInput id="manual-amount" value={amount} onValueChange={setAmount} />
      </div>

      <Button type="submit" variant="secondary" disabled={!canAdd}>
        <Plus className="size-4" /> Adicionar
      </Button>
    </form>
  );
}
