import * as React from "react";
import { Calculator, Lock, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL, formatPercent } from "@/lib/format";

import type { TaxObligationKind, TaxRuleWithTiers } from "../api";
import { KIND_META, PERIOD_KIND_META, periodLabel } from "../constants";
import { useAssessments, useDeleteTaxRule, useTaxRules } from "../hooks";
import { ApuracaoSheet } from "./ApuracaoSheet";
import { TaxRuleSheet } from "./TaxRuleSheet";

/**
 * A aba de apuração: escolhe empresa + tributo + competência e abre o demonstrativo.
 *
 * Exige UMA empresa no seletor superior. A regra do tributo é da empresa (alíquota,
 * presunção, vencimento), então não existe "apurar consolidado" — somar o IRPJ de
 * quatro empresas sob um rótulo só seria exatamente o erro silencioso que este projeto
 * evita.
 */

interface Props {
  companyId: string | null;
  companyName: string;
  companyIds: string[] | null;
  isMultiCompany: boolean;
}

/** Últimos 18 meses + os 2 próximos: cobre retificação de período antigo e o corrente. */
function periodOptions(): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let offset = 2; offset >= -17; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    out.push({ value, label: periodLabel(value, "monthly") });
  }
  return out;
}

export function ApuracaoPanel({ companyId, companyName, companyIds, isMultiCompany }: Props) {
  const periods = React.useMemo(periodOptions, []);
  const [kind, setKind] = React.useState<TaxObligationKind | null>(null);
  const [period, setPeriod] = React.useState<string>(
    () =>
      periods.find((p) => p.value <= new Date().toISOString().slice(0, 10))?.value ??
      periods[0].value,
  );
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [ruleSheet, setRuleSheet] = React.useState<{ rule: TaxRuleWithTiers | null } | null>(null);
  const [confirmDeleteRule, setConfirmDeleteRule] = React.useState<TaxRuleWithTiers | null>(null);

  const rulesQuery = useTaxRules(companyId ? [companyId] : companyIds);
  const assessmentsQuery = useAssessments({ companyIds });
  const deleteRule = useDeleteTaxRule();

  const rules = rulesQuery.data ?? [];
  const companyRules = companyId ? rules.filter((r) => r.company_id === companyId) : rules;
  const activeKinds = React.useMemo(
    () => [...new Set(companyRules.filter((r) => r.active).map((r) => r.kind))],
    [companyRules],
  );

  // Sem tributo escolhido, assume o primeiro com regra — evita um passo a mais no
  // caso normal (uma empresa, poucos tributos).
  const effectiveKind = kind ?? activeKinds[0] ?? null;

  return (
    <div className="space-y-5">
      {/* --- Apurar ------------------------------------------------------- */}
      <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
          Apurar competência
        </div>

        {!companyId ? (
          <p className="mt-1 text-sm text-text-muted">
            A regra do tributo é de <strong>uma</strong> empresa — alíquota, presunção e vencimento
            mudam entre elas. Escolha uma no seletor superior para apurar.
          </p>
        ) : activeKinds.length === 0 ? (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-text-muted">
              {companyName} ainda não tem regra de tributo cadastrada. A regra é o que guarda
              alíquota, presunção, adicional e vencimento — sem ela não há o que apurar.
            </p>
            <Button size="sm" onClick={() => setRuleSheet({ rule: null })}>
              <Plus className="size-4" /> Cadastrar a primeira regra
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="apurar-kind">Imposto</Label>
              <Select
                value={effectiveKind ?? ""}
                onValueChange={(v) => setKind(v as TaxObligationKind)}
              >
                <SelectTrigger id="apurar-kind" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeKinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_META[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="apurar-period">Competência</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger id="apurar-period" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button disabled={!effectiveKind} onClick={() => setSheetOpen(true)}>
              <Calculator className="size-4" /> Apurar
            </Button>

            <p className="w-full text-xs text-text-muted">
              A competência trimestral é deduzida do mês escolhido — qualquer mês do trimestre abre
              o trimestre inteiro.
            </p>
          </div>
        )}
      </div>

      {/* --- Regras ------------------------------------------------------- */}
      <section className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Settings2 className="size-3.5 text-text-subtle" />
            <span className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
              Regras dos tributos
            </span>
            <span className="text-2xs text-text-subtle">
              {companyRules.length} {companyRules.length === 1 ? "regra" : "regras"}
            </span>
          </div>
          {companyId && (
            <Button size="sm" variant="secondary" onClick={() => setRuleSheet({ rule: null })}>
              <Plus className="size-3.5" /> Nova regra
            </Button>
          )}
        </header>

        {rulesQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : companyRules.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-muted">
            Nenhuma regra cadastrada neste escopo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs border-b border-border font-medium tracking-wide text-text-subtle uppercase">
                  <th className="px-3 py-2 text-left">Imposto</th>
                  <th className="px-3 py-2 text-left">Período</th>
                  <th className="px-3 py-2 text-right">Alíquota</th>
                  <th className="px-3 py-2 text-left">Data-base</th>
                  <th className="px-3 py-2 text-left">Presunção</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-left">Vigência</th>
                  <th className="w-20 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {companyRules.map((r) => (
                  <tr key={r.id} className={cn("hover:bg-surface-2/40", !r.active && "opacity-50")}>
                    <td className="px-3 py-2">{KIND_META[r.kind].label}</td>
                    <td className="px-3 py-2 text-xs text-text-muted">
                      {PERIOD_KIND_META[r.period_kind].label}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {formatPercent(r.rate)}
                      {r.surtax_rate != null && (
                        <span className="text-2xs block text-text-subtle">
                          +{formatPercent(r.surtax_rate)} adicional
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-muted">
                      {r.base_date_basis === "cash" ? "caixa / nota" : "competência"}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-muted">
                      {r.uses_presumption
                        ? `${r.tax_rule_presumptions.length} faixa(s)`
                        : "base = receita"}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-muted">
                      dia {r.due_day === 31 ? "último" : r.due_day}
                      {r.due_date_adjust === "previous_business_day" && " · antecipa"}
                      {r.due_date_adjust === "next_business_day" && " · posterga"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">
                      {formatDate(r.valid_from)}
                      {r.valid_to && ` a ${formatDate(r.valid_to)}`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Editar regra"
                          onClick={() => setRuleSheet({ rule: r })}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-expense hover:bg-expense-soft hover:text-expense"
                          aria-label="Excluir regra"
                          onClick={() => setConfirmDeleteRule(r)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Apurações feitas --------------------------------------------- */}
      <section className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        <header className="border-b border-border bg-surface-2 px-4 py-2.5">
          <span className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
            Apurações
          </span>
        </header>

        {assessmentsQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (assessmentsQuery.data ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-text-muted">
            Nenhuma apuração ainda. Escolha imposto e competência acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs border-b border-border font-medium tracking-wide text-text-subtle uppercase">
                  <th className="px-3 py-2 text-left">Imposto</th>
                  <th className="px-3 py-2 text-left">Competência</th>
                  <th className="px-3 py-2 text-right">Receita bruta</th>
                  <th className="px-3 py-2 text-right">Base</th>
                  <th className="px-3 py-2 text-right">Saldo devedor</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {(assessmentsQuery.data ?? []).map((a) => (
                  <tr key={a.id} className="hover:bg-surface-2/40">
                    <td className="px-3 py-2">{KIND_META[a.kind].label}</td>
                    <td className="px-3 py-2 text-xs">
                      {periodLabel(a.period_start, a.period_kind)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
                      {formatBRL(a.gross_revenue)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
                      {formatBRL(a.taxable_base)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm font-semibold">
                      {formatBRL(a.amount_due)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {formatDate(a.due_date)}
                    </td>
                    <td className="px-3 py-2">
                      {a.status === "confirmed" ? (
                        <Badge tone="income">
                          <Lock className="mr-1 size-3" /> Confirmada
                        </Badge>
                      ) : (
                        <Badge tone="warning">Rascunho</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isMultiCompany && (
          <p className="text-2xs border-t border-border px-4 py-2 text-text-subtle">
            A lista soma o escopo inteiro; apurar exige uma empresa.
          </p>
        )}
      </section>

      <ApuracaoSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        companyId={companyId}
        companyName={companyName}
        kind={effectiveKind}
        periodDate={period}
      />

      {ruleSheet && companyId && (
        <TaxRuleSheet
          open
          onOpenChange={(o) => !o && setRuleSheet(null)}
          companyId={companyId}
          companyName={companyName}
          rule={ruleSheet.rule}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteRule)}
        onOpenChange={(o) => !o && setConfirmDeleteRule(null)}
        title="Excluir regra do tributo"
        description={
          <>
            Excluir a regra de{" "}
            <strong>{confirmDeleteRule ? KIND_META[confirmDeleteRule.kind].label : ""}</strong>? As
            apurações já feitas continuam, mas não será possível apurar novas competências deste
            tributo até cadastrar outra regra.
          </>
        }
        confirmLabel="Excluir"
        pending={deleteRule.isPending}
        onConfirm={() => {
          if (!confirmDeleteRule) return;
          deleteRule.mutate(confirmDeleteRule.id, {
            onSuccess: () => {
              toast.success("Regra excluída");
              setConfirmDeleteRule(null);
            },
            onError: (err) => toast.error("Erro ao excluir", { description: err.message }),
          });
        }}
      />
    </div>
  );
}
