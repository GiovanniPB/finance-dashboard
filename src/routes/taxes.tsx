import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useCompanyScope } from "@/features/companies/CompanyContext";
import type { TaxObligation, TaxObligationStatus } from "@/features/taxes/api";
import { PayTaxDialog } from "@/features/taxes/components/PayTaxDialog";
import { KIND_META, STATUS_META } from "@/features/taxes/constants";
import {
  useDeleteTaxObligation,
  useGenerateTaxObligations,
  useMarkOverdue,
  useTaxObligations,
} from "@/features/taxes/hooks";
import { cn } from "@/lib/cn";
import { formatDate, formatMonthYear, isoDate } from "@/lib/dates";
import { formatBRL, formatPercent } from "@/lib/format";

type Filter = "open" | "paid" | "all";

export default function TaxesPage() {
  const { isConsolidated, selectedCompany, selectedCompanyId } = useCompanyScope();
  const [filter, setFilter] = React.useState<Filter>("open");
  const [paying, setPaying] = React.useState<TaxObligation | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<TaxObligation | null>(null);

  const today = new Date();
  const referencePeriod = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const statusFilter = React.useMemo<TaxObligationStatus[] | undefined>(() => {
    if (filter === "all") return undefined;
    if (filter === "paid") return ["paid"];
    return ["pending", "overdue"];
  }, [filter]);

  const { data: obligations = [], isLoading } = useTaxObligations(
    selectedCompanyId ? { companyId: selectedCompanyId, status: statusFilter } : null,
  );

  const generateMutation = useGenerateTaxObligations();
  const overdueMutation = useMarkOverdue();
  const deleteMutation = useDeleteTaxObligation();

  // Auto-mark overdue obligations on mount
  React.useEffect(() => {
    if (selectedCompanyId) {
      overdueMutation.mutate(selectedCompanyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  if (isConsolidated || !selectedCompanyId) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
        <Header isConsolidated />
        <Card>
          <CardContent className="p-6 text-center text-sm text-text-muted">
            Selecione uma empresa específica no seletor superior para gerenciar obrigações fiscais.
          </CardContent>
        </Card>
      </div>
    );
  }

  const companyName = selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—";
  const regime = selectedCompany?.tax_regime ?? "—";

  const totalDue = obligations
    .filter((o) => o.status === "pending" || o.status === "overdue")
    .reduce((a, o) => a + o.amount_estimated, 0);
  const overdueCount = obligations.filter((o) => o.status === "overdue").length;
  const next7Days = obligations.filter((o) => {
    if (o.status !== "pending") return false;
    const due = new Date(o.due_date);
    const diff = (due.getTime() - today.getTime()) / 86400000;
    return diff >= 0 && diff <= 7;
  });

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <Header companyName={companyName} regime={regime} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi label="Total em aberto" value={formatBRL(totalDue)} tone="warning" />
        <Kpi
          label="Vencendo em 7 dias"
          value={`${next7Days.length} obrigação(ões)`}
          tone={next7Days.length > 0 ? "warning" : "info"}
        />
        <Kpi
          label="Vencidas"
          value={`${overdueCount} obrigação(ões)`}
          tone={overdueCount > 0 ? "expense" : "info"}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-4">
        <div className="flex-1">
          <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
            Geração de obrigações
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Gera as obrigações típicas para <strong>{formatMonthYear(referencePeriod)}</strong>{" "}
            baseadas no regime tributário ({regime}). A operação é idempotente — re-executar
            atualiza valores das obrigações pendentes sem duplicar.
          </p>
        </div>
        <Button
          size="sm"
          disabled={generateMutation.isPending}
          onClick={() => {
            generateMutation.mutate(
              { companyId: selectedCompanyId, referencePeriod },
              {
                onSuccess: (rows) => toast.success(`${rows.length} obrigação(ões) atualizadas`),
                onError: (err) => toast.error("Erro ao gerar", { description: err.message }),
              },
            );
          }}
        >
          {generateMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Gerar mês atual
        </Button>
      </div>

      {next7Days.length > 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <strong className="text-warning">Próximos vencimentos</strong>
            <ul className="mt-0.5 list-disc pl-5 text-text-muted">
              {next7Days.slice(0, 5).map((o) => (
                <li key={o.id}>
                  {KIND_META[o.kind].label} — {formatDate(o.due_date)} —{" "}
                  <span className="font-mono">{formatBRL(o.amount_estimated)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Label htmlFor="filter" className="sr-only">
          Filtro
        </Label>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger id="filter" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Em aberto / Vencidas</SelectItem>
            <SelectItem value="paid">Pagas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-text-muted">{obligations.length} obrigação(ões)</span>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : obligations.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma obrigação encontrada. Clique em "Gerar mês atual" para criar as obrigações típicas
          da empresa.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                <th className="px-3 py-2.5 text-left">Imposto</th>
                <th className="px-3 py-2.5 text-left">Competência</th>
                <th className="px-3 py-2.5 text-left">Vencimento</th>
                <th className="px-3 py-2.5 text-right">Base</th>
                <th className="px-3 py-2.5 text-right">Alíquota</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="w-40 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {obligations.map((o) => {
                const status = STATUS_META[o.status];
                const kind = KIND_META[o.kind];
                const isOpen = o.status === "pending" || o.status === "overdue";
                return (
                  <tr key={o.id} className="hover:bg-surface-2/60">
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-medium">{kind.label}</div>
                      <div className="text-2xs text-text-subtle">{kind.description}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                      {formatMonthYear(o.reference_period)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                      {formatDate(o.due_date)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-text-muted">
                      {o.base_amount ? formatBRL(o.base_amount) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-text-muted">
                      {o.rate_pct == null ? "—" : formatPercent(o.rate_pct, { fromHundred: true })}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-mono text-sm font-semibold">
                        {formatBRL(o.amount_estimated)}
                      </div>
                      {o.amount_paid > 0 && o.amount_paid !== o.amount_estimated && (
                        <div className="text-2xs text-text-subtle">
                          pago {formatBRL(o.amount_paid)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isOpen && (
                          <Button size="sm" onClick={() => setPaying(o)}>
                            <CheckCircle2 className="size-3.5" /> Pagar
                          </Button>
                        )}
                        {isOpen && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmDelete(o)}
                            aria-label="Excluir"
                            className={cn("text-expense hover:bg-expense-soft hover:text-expense")}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PayTaxDialog obligation={paying} onOpenChange={(open) => !open && setPaying(null)} />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Excluir obrigação"
        description={
          <>
            Excluir <strong>{confirmDelete ? KIND_META[confirmDelete.kind].label : ""}</strong> de{" "}
            <strong>{confirmDelete ? formatMonthYear(confirmDelete.reference_period) : ""}</strong>?
            Você pode gerar novamente depois.
          </>
        }
        confirmLabel="Excluir"
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (!confirmDelete) return;
          deleteMutation.mutate(confirmDelete.id, {
            onSuccess: () => {
              toast.success("Obrigação excluída");
              setConfirmDelete(null);
            },
            onError: (err) => toast.error("Erro ao excluir", { description: err.message }),
          });
        }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "info" | "warning" | "expense" | "income";
}) {
  const toneClass = {
    info: "text-info",
    warning: "text-warning",
    expense: "text-expense",
    income: "text-income",
  }[tone];
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4">
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">{label}</div>
        <div className={cn("font-mono text-2xl font-semibold tracking-tight", toneClass)}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Header({
  isConsolidated,
  companyName,
  regime,
}: {
  isConsolidated?: boolean;
  companyName?: string;
  regime?: string;
}) {
  const regimeLabel: Record<string, string> = {
    simples: "Simples Nacional",
    lucro_presumido: "Lucro Presumido",
    lucro_real: "Lucro Real",
    mei: "MEI",
  };
  return (
    <div>
      <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
        Impostos & Obrigações
      </div>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
        {isConsolidated ? "Consolidado" : companyName}
      </h1>
      {!isConsolidated && regime && (
        <p className="mt-1 text-sm text-text-muted">
          Regime tributário:{" "}
          <Badge tone="info" className="ml-1">
            {regimeLabel[regime] ?? regime}
          </Badge>
        </p>
      )}
    </div>
  );
}
