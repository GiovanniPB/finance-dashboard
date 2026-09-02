import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Eye, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth/usePermissions";
import { useBankAccounts } from "@/features/bank-accounts/hooks";
import { useSingleCompanyPicker } from "@/features/companies/useSingleCompanyPicker";
import type {
  StatementLineStatus,
  StatementLineWithRelations,
} from "@/features/reconciliation/api";
import { MatchPanel } from "@/features/reconciliation/components/MatchPanel";
import { OfxUploadCard } from "@/features/reconciliation/components/OfxUploadCard";
import { useDeleteLine, useStatementLines, useUnmatchLine } from "@/features/reconciliation/hooks";
import { PagarmeReconcileCard } from "@/features/sales/components/PagarmeReconcileCard";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

type Filter = "unmatched" | "matched" | "ignored" | "all";

const STATUS_META: Record<
  StatementLineStatus,
  { label: string; tone: "info" | "warning" | "income" | "expense" | "default" | "accent" }
> = {
  unmatched: { label: "Pendente", tone: "warning" },
  matched: { label: "Conciliada", tone: "income" },
  created: { label: "Criada", tone: "accent" },
  ignored: { label: "Ignorada", tone: "default" },
};

export default function ReconciliationPage() {
  // Conciliar é ato de UMA empresa: a linha do extrato pertence a uma conta bancária,
  // que pertence a uma empresa. Num escopo com várias, escolhe-se entre as do escopo —
  // agregar não faria sentido aqui.
  const {
    companyId: selectedCompanyId,
    setCompanyId,
    options: scopeCompanies,
    needsPicker,
  } = useSingleCompanyPicker();
  const { canEdit } = usePermissions();
  const [filter, setFilter] = React.useState<Filter>("unmatched");
  const [activeLineId, setActiveLineId] = React.useState<string | null>(null);

  const statusFilter = React.useMemo<StatementLineStatus[] | undefined>(() => {
    if (filter === "all") return undefined;
    if (filter === "matched") return ["matched", "created"];
    return [filter];
  }, [filter]);

  const { data: lines = [], isLoading } = useStatementLines(
    selectedCompanyId ? { companyId: selectedCompanyId, status: statusFilter } : null,
  );

  // Contas reais da empresa: destino possível do saque do pagar.me. A carteira do
  // gateway é excluída — transferir dela para ela mesma não faz sentido.
  const { data: bankAccounts = [] } = useBankAccounts(selectedCompanyId);
  const payoutTargets = React.useMemo(
    () =>
      bankAccounts
        .filter((a) => a.account_type !== "payment_gateway")
        .map((a) => ({ id: a.id, nickname: a.nickname })),
    [bankAccounts],
  );

  const unmatchMutation = useUnmatchLine();
  const deleteMutation = useDeleteLine();

  const activeLine = lines.find((l) => l.id === activeLineId) ?? null;

  if (!selectedCompanyId) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
        <Header scopeName="—" />
        <Card>
          <CardContent className="p-6 text-center text-sm text-text-muted">
            Nenhuma empresa no escopo atual para conciliar.
          </CardContent>
        </Card>
      </div>
    );
  }

  const companyName =
    scopeCompanies.find((c) => c.id === selectedCompanyId)?.trade_name ??
    scopeCompanies.find((c) => c.id === selectedCompanyId)?.legal_name ??
    "—";

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <Header
        scopeName={companyName}
        picker={
          needsPicker
            ? { value: selectedCompanyId, options: scopeCompanies, onChange: setCompanyId }
            : null
        }
      />

      <OfxUploadCard companyId={selectedCompanyId} />

      <PagarmeReconcileCard
        companyId={selectedCompanyId}
        bankAccounts={payoutTargets}
        canEdit={canEdit}
      />

      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unmatched">Pendentes</SelectItem>
            <SelectItem value="matched">Conciliadas</SelectItem>
            <SelectItem value="ignored">Ignoradas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-text-muted">{lines.length} linha(s)</span>
      </div>

      {activeLine && <MatchPanel line={activeLine} onClose={() => setActiveLineId(null)} />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : lines.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          {filter === "unmatched"
            ? "Nenhuma linha pendente. Importe um arquivo OFX acima para começar."
            : "Nenhuma linha encontrada para esse filtro."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                <th className="px-3 py-2.5 text-left">Data</th>
                <th className="px-3 py-2.5 text-left">Descrição</th>
                <th className="px-3 py-2.5 text-left">Conta</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="w-44 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((line) => (
                <Row
                  key={line.id}
                  line={line}
                  isActive={activeLineId === line.id}
                  onToggle={() => setActiveLineId(activeLineId === line.id ? null : line.id)}
                  onUnmatch={() => {
                    unmatchMutation.mutate(line.id, {
                      onSuccess: () => toast.success("Conciliação revertida"),
                      onError: (err) =>
                        toast.error("Erro ao reverter", { description: err.message }),
                    });
                  }}
                  onDelete={() => {
                    deleteMutation.mutate(line.id, {
                      onSuccess: () => toast.success("Linha removida"),
                      onError: (err) =>
                        toast.error("Erro ao remover", { description: err.message }),
                    });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface RowProps {
  line: StatementLineWithRelations;
  isActive: boolean;
  onToggle: () => void;
  onUnmatch: () => void;
  onDelete: () => void;
}

function Row({ line, isActive, onToggle, onUnmatch, onDelete }: RowProps) {
  const isCredit = line.amount >= 0;
  const meta = STATUS_META[line.status];
  return (
    <tr
      className={cn("transition-colors", isActive ? "bg-accent-soft/30" : "hover:bg-surface-2/60")}
    >
      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
        {formatDate(line.posted_at)}
      </td>
      <td className="max-w-[420px] px-3 py-2.5">
        <div className="truncate">{line.description}</div>
        {line.document_ref && (
          <div className="text-2xs text-text-subtle">Doc: {line.document_ref}</div>
        )}
      </td>
      <td className="max-w-[180px] px-3 py-2.5">
        <span className="truncate text-xs text-text-muted">
          {line.bank_account
            ? `${line.bank_account.nickname} · ${line.bank_account.bank_name}`
            : "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono text-sm font-semibold",
            isCredit ? "text-income" : "text-expense",
          )}
        >
          {isCredit ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
          {formatBRL(Math.abs(line.amount))}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </td>
      <td className="px-3 py-2.5 text-right">
        {line.status === "unmatched" && (
          <Button size="sm" variant={isActive ? "secondary" : "outline"} onClick={onToggle}>
            <CheckCircle2 className="size-3.5" />
            {isActive ? "Fechar" : "Conciliar"}
          </Button>
        )}
        {line.status === "matched" && (
          <Button size="sm" variant="ghost" onClick={onUnmatch} title="Reverter conciliação">
            <RotateCcw className="size-3.5" /> Reverter
          </Button>
        )}
        {line.status === "ignored" && (
          <span className="text-2xs inline-flex items-center gap-1 text-text-subtle">
            <Eye className="size-3" /> ignorada
          </span>
        )}
        {(line.status === "ignored" || line.status === "matched") && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Remover"
            className="text-expense hover:bg-expense-soft hover:text-expense"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}

function Header({
  scopeName,
  picker,
}: {
  scopeName: string;
  picker?: {
    value: string;
    options: { id: string; trade_name: string | null; legal_name: string }[];
    onChange: (id: string) => void;
  } | null;
}) {
  return (
    <div>
      <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
        Conciliação Bancária
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{scopeName}</h1>
        {picker && (
          <Select value={picker.value} onValueChange={picker.onChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {picker.options.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.trade_name ?? c.legal_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Importe extratos OFX e concilie linhas com lançamentos existentes. Linhas duplicadas (mesmo
        FITID por conta) são descartadas automaticamente.
      </p>
    </div>
  );
}
