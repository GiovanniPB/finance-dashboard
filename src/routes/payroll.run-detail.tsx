import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountCombobox } from "@/features/accounts/AccountCombobox";
import {
  useDeletePayrollItem,
  usePayrollItems,
  usePayrollRun,
  usePostPayrollRun,
  useUpdatePayrollItem,
} from "@/features/payroll/hooks";
import { cn } from "@/lib/cn";
import { formatMonthYear } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  fixed: "Fixo",
  variable: "Variável",
  bonus: "Bônus",
  vacation: "Férias",
  thirteenth: "13º",
  severance: "Rescisão",
  adjustment: "Ajuste",
};

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: run, isLoading: runLoading } = usePayrollRun(id);
  const { data: items = [], isLoading: itemsLoading } = usePayrollItems(id);
  const update = useUpdatePayrollItem();
  const remove = useDeletePayrollItem();
  const post = usePostPayrollRun();

  const [postOpen, setPostOpen] = React.useState(false);
  const [defaultAccountId, setDefaultAccountId] = React.useState<string | null>(null);

  const isPosted = run?.status === "posted";

  const totals = items.reduce(
    (acc, it) => {
      acc.gross += it.gross_amount;
      acc.benefits += it.benefits;
      acc.charges += it.fgts + it.inss + it.irrf;
      acc.employerCost += it.employer_cost ?? 0;
      return acc;
    },
    { gross: 0, benefits: 0, charges: 0, employerCost: 0 },
  );

  function handleUpdate(itemId: string, field: string, value: number) {
    update.mutate({ id: itemId, payload: { [field]: value } });
  }

  function handleRemove(itemId: string) {
    remove.mutate(itemId, {
      onSuccess: () => toast.success("Item removido"),
      onError: (err) => toast.error("Erro", { description: err.message }),
    });
  }

  function handlePost() {
    if (!id || !defaultAccountId) return;
    post.mutate(
      { runId: id, defaultAccountId },
      {
        onSuccess: (r) => {
          toast.success(`${r.generatedCount} lançamentos gerados`, {
            description: `Total ${formatBRL(r.totalAmount)}`,
          });
          setPostOpen(false);
        },
        onError: (err) => toast.error("Erro ao postar", { description: err.message }),
      },
    );
  }

  if (runLoading || !run) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link to="/payroll/runs">
              <ArrowLeft className="size-4" /> Voltar
            </Link>
          </Button>
          <h2 className="font-display text-2xl font-semibold capitalize">
            Folha de {formatMonthYear(run.reference_month)}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {items.length} item(ns) ·{" "}
            {isPosted ? (
              <Badge tone="income">Postada</Badge>
            ) : (
              <Badge tone="warning">Rascunho</Badge>
            )}
          </p>
        </div>
        {!isPosted && (
          <Button onClick={() => setPostOpen(true)} disabled={items.length === 0}>
            <Send className="size-4" /> Postar folha
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard label="Bruto total" value={totals.gross} />
        <SummaryCard label="Benefícios" value={totals.benefits} />
        <SummaryCard label="Encargos (FGTS+INSS+IRRF)" value={totals.charges} />
        <SummaryCard label="Custo empregador" value={totals.employerCost} tone="accent" />
      </div>

      {itemsLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Sem itens nessa folha.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60">
              <tr className="border-b border-border">
                <Th>Colaborador</Th>
                <Th>Tipo</Th>
                <Th align="right">Bruto</Th>
                <Th align="right">INSS</Th>
                <Th align="right">FGTS</Th>
                <Th align="right">IRRF</Th>
                <Th align="right">Benefícios</Th>
                <Th align="right">Líquido</Th>
                <Th align="right">Custo</Th>
                {!isPosted && <Th align="right">Ações</Th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.employee?.full_name ?? "—"}</div>
                    {item.employee?.role && (
                      <div className="text-2xs text-text-subtle">{item.employee.role}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-muted">
                    {PAYMENT_TYPE_LABELS[item.payment_type] ?? item.payment_type}
                  </td>
                  <EditableCell
                    value={item.gross_amount}
                    disabled={isPosted}
                    onCommit={(v) => handleUpdate(item.id, "gross_amount", v)}
                  />
                  <EditableCell
                    value={item.inss}
                    disabled={isPosted}
                    onCommit={(v) => handleUpdate(item.id, "inss", v)}
                  />
                  <EditableCell
                    value={item.fgts}
                    disabled={isPosted}
                    onCommit={(v) => handleUpdate(item.id, "fgts", v)}
                  />
                  <EditableCell
                    value={item.irrf}
                    disabled={isPosted}
                    onCommit={(v) => handleUpdate(item.id, "irrf", v)}
                  />
                  <EditableCell
                    value={item.benefits}
                    disabled={isPosted}
                    onCommit={(v) => handleUpdate(item.id, "benefits", v)}
                  />
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {formatBRL(item.net_amount ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-accent tabular-nums">
                    {formatBRL(item.employer_cost ?? 0)}
                  </td>
                  {!isPosted && (
                    <td className="px-3 py-2 text-right">
                      <button
                        aria-label="Remover"
                        onClick={() => handleRemove(item.id)}
                        className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-expense-soft hover:text-expense"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Post dialog */}
      <Sheet open={postOpen} onOpenChange={setPostOpen}>
        <SheetContent size="md" className="flex flex-col p-0">
          <SheetHeader>
            <SheetTitle>Postar folha de {formatMonthYear(run.reference_month)}</SheetTitle>
            <SheetDescription>
              Cada item vira um lançamento (outflow) com o valor do custo empregador. Escolha a
              conta contábil padrão para imputar.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <Card className="border-warning/30 bg-warning-soft/20">
              <CardContent className="p-4 text-sm">
                <p className="font-medium text-warning">⚠️ Esta ação é irreversível</p>
                <p className="mt-1 text-text-muted">
                  Após postar, os itens não podem mais ser editados e {items.length} lançamento(s)
                  totalizando{" "}
                  <span className="font-mono font-semibold text-text">
                    {formatBRL(totals.employerCost)}
                  </span>{" "}
                  serão criados.
                </p>
              </CardContent>
            </Card>

            <div className="space-y-1.5">
              <Label>Conta padrão para imputação</Label>
              <AccountCombobox
                companyId={run.company_id}
                value={defaultAccountId}
                onChange={setDefaultAccountId}
                kindFilter={["cogs", "personnel_expense", "operating_expense"]}
              />
              <p className="text-2xs text-text-subtle">
                Filtros: contas de CMV, Pessoal ou Despesa operacional. Recomendado: código 6.1.01
                (Salários) ou 4.01 (CMV) dependendo do regime.
              </p>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setPostOpen(false)} disabled={post.isPending}>
              Cancelar
            </Button>
            <Button onClick={handlePost} disabled={!defaultAccountId || post.isPending}>
              {post.isPending && <Loader2 className="size-4 animate-spin" />}
              Postar {items.length} lançamento(s)
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "accent" }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">{label}</div>
        <div
          className={cn(
            "font-mono text-lg font-semibold tabular-nums",
            tone === "accent" && "text-accent",
          )}
        >
          {formatBRL(value)}
        </div>
      </CardContent>
    </Card>
  );
}

function EditableCell({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  if (disabled) {
    return (
      <td className="px-3 py-2 text-right font-mono text-xs text-text-muted tabular-nums">
        {value === 0 ? "—" : formatBRL(value)}
      </td>
    );
  }

  if (editing) {
    return (
      <td className="px-3 py-2 text-right">
        <CurrencyInput
          value={draft}
          onValueChange={setDraft}
          autoFocus
          onBlur={() => {
            if (draft !== value) onCommit(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (draft !== value) onCommit(draft);
              setEditing(false);
            } else if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="h-7 min-w-[100px]"
        />
      </td>
    );
  }

  return (
    <td
      className="cursor-pointer px-3 py-2 text-right font-mono text-xs tabular-nums hover:bg-accent-soft/30"
      onClick={() => setEditing(true)}
    >
      {value === 0 ? <span className="text-text-subtle">—</span> : formatBRL(value)}
    </td>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "text-2xs px-3 py-2.5 font-medium tracking-wide text-text-subtle uppercase",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
