import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { COMPONENT_META, KIND_META } from "@/features/payroll-mappings/constants";
import { usePayrollPostingPreview } from "@/features/payroll-mappings/hooks";
import {
  useDeletePayrollItem,
  useDeletePayrollRun,
  usePayrollItems,
  usePayrollRun,
  usePostPayrollRun,
  useUpdatePayrollItem,
} from "@/features/payroll/hooks";
import { cn } from "@/lib/cn";
import { formatMonthYear } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: run, isLoading: runLoading } = usePayrollRun(id);
  const { data: items = [], isLoading: itemsLoading } = usePayrollItems(id);
  const update = useUpdatePayrollItem();
  const remove = useDeletePayrollItem();
  const removeRun = useDeletePayrollRun();
  const post = usePostPayrollRun();

  const [postOpen, setPostOpen] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [defaultAccountId, setDefaultAccountId] = React.useState<string | null>(null);

  const isPosted = run?.status === "posted";

  const totals = items.reduce(
    (acc, it) => {
      acc.fixed += it.fixed_amount;
      acc.variable += it.variable_amount;
      acc.bonus += it.bonus_amount;
      acc.profitSharing += it.profit_sharing_amount;
      acc.gross += it.gross_amount;
      acc.benefits += it.benefits;
      acc.charges += it.fgts + it.inss + it.irrf;
      acc.employerCost += it.employer_cost ?? 0;
      return acc;
    },
    {
      fixed: 0,
      variable: 0,
      bonus: 0,
      profitSharing: 0,
      gross: 0,
      benefits: 0,
      charges: 0,
      employerCost: 0,
    },
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

  function handleDeleteRun() {
    if (!id) return;
    removeRun.mutate(id, {
      onSuccess: () => {
        toast.success("Folha excluída");
        setConfirmDeleteOpen(false);
        void navigate("/payroll/runs");
      },
      onError: (err) => toast.error("Erro ao excluir", { description: err.message }),
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
        <div className="flex items-center gap-2">
          {!isPosted && (
            <Button onClick={() => setPostOpen(true)} disabled={items.length === 0}>
              <Send className="size-4" /> Postar folha
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={removeRun.isPending}
            className="text-expense hover:bg-expense-soft hover:text-expense"
          >
            {removeRun.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Excluir folha
          </Button>
        </div>
      </div>

      {isPosted && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/30 bg-warning-soft/20 px-3 py-2 text-xs text-text-muted">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          <span>
            Folha já postada. Edições nos valores (bruto, benefícios) atualizam automaticamente os
            lançamentos vinculados.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Fixo" value={totals.fixed} />
        <SummaryCard label="Variável" value={totals.variable} />
        <SummaryCard label="Bônus" value={totals.bonus} />
        <SummaryCard label="PL" value={totals.profitSharing} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
                <Th align="right">Fixo</Th>
                <Th align="right">Variável</Th>
                <Th align="right">Bônus</Th>
                <Th align="right">PL</Th>
                <Th align="right">Bruto</Th>
                <Th align="right">INSS</Th>
                <Th align="right">FGTS</Th>
                <Th align="right">IRRF</Th>
                <Th align="right">Benefícios</Th>
                <Th align="right">Líquido</Th>
                <Th align="right">Custo</Th>
                <Th align="right">Ações</Th>
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
                  <EditableCell
                    value={item.fixed_amount}
                    onCommit={(v) => handleUpdate(item.id, "fixed_amount", v)}
                  />
                  <EditableCell
                    value={item.variable_amount}
                    onCommit={(v) => handleUpdate(item.id, "variable_amount", v)}
                  />
                  <EditableCell
                    value={item.bonus_amount}
                    onCommit={(v) => handleUpdate(item.id, "bonus_amount", v)}
                  />
                  <EditableCell
                    value={item.profit_sharing_amount}
                    onCommit={(v) => handleUpdate(item.id, "profit_sharing_amount", v)}
                  />
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums">
                    {formatBRL(item.gross_amount)}
                  </td>
                  <EditableCell
                    value={item.inss}
                    onCommit={(v) => handleUpdate(item.id, "inss", v)}
                  />
                  <EditableCell
                    value={item.fgts}
                    onCommit={(v) => handleUpdate(item.id, "fgts", v)}
                  />
                  <EditableCell
                    value={item.irrf}
                    onCommit={(v) => handleUpdate(item.id, "irrf", v)}
                  />
                  <EditableCell
                    value={item.benefits}
                    onCommit={(v) => handleUpdate(item.id, "benefits", v)}
                  />
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                    {formatBRL(item.net_amount ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-accent tabular-nums">
                    {formatBRL(item.employer_cost ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      aria-label="Remover"
                      onClick={() => handleRemove(item.id)}
                      className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-expense-soft hover:text-expense"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Excluir folha de ${formatMonthYear(run.reference_month)}?`}
        description="Os lançamentos vinculados também serão removidos. Esta ação não pode ser desfeita."
        confirmLabel="Excluir folha"
        pending={removeRun.isPending}
        onConfirm={handleDeleteRun}
      />

      {/* Post dialog */}
      <Sheet open={postOpen} onOpenChange={setPostOpen}>
        <SheetContent size="md" className="flex flex-col p-0">
          <PostPayrollSheetContent
            runId={run.id}
            companyId={run.company_id}
            referenceMonth={run.reference_month}
            defaultAccountId={defaultAccountId}
            setDefaultAccountId={setDefaultAccountId}
            onCancel={() => setPostOpen(false)}
            onConfirm={handlePost}
            isPending={post.isPending}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface PostSheetProps {
  runId: string;
  companyId: string;
  referenceMonth: string;
  defaultAccountId: string | null;
  setDefaultAccountId: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

function PostPayrollSheetContent({
  runId,
  companyId,
  referenceMonth,
  defaultAccountId,
  setDefaultAccountId,
  onCancel,
  onConfirm,
  isPending,
}: PostSheetProps) {
  const { data: preview = [], isLoading } = usePayrollPostingPreview(runId);

  const missingCount = preview.filter((p) => !p.has_mapping).length;
  const totalAmount = preview.reduce((a, r) => a + r.amount, 0);

  return (
    <>
      <SheetHeader>
        <SheetTitle>Postar folha de {formatMonthYear(referenceMonth)}</SheetTitle>
        <SheetDescription>
          Cada componente da folha (salário, FGTS, benefícios, retenções) é postado na conta DRE
          configurada em <strong>Configurações → Folha de pagamento</strong>.
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="space-y-4">
        <Card className="border-warning/30 bg-warning-soft/20">
          <CardContent className="p-4 text-sm">
            <p className="font-medium text-warning">⚠️ Esta ação é irreversível</p>
            <p className="mt-1 text-text-muted">
              Serão criados <strong>{preview.length}</strong> lançamento(s) totalizando{" "}
              <span className="font-mono font-semibold text-text">{formatBRL(totalAmount)}</span>.
            </p>
          </CardContent>
        </Card>

        {missingCount > 0 && (
          <Card className="border-expense/30 bg-expense-soft/20">
            <CardContent className="p-4 text-sm">
              <p className="font-medium text-expense">
                <AlertTriangle className="mr-1 inline size-4" />
                {missingCount} componente(s) sem mapeamento configurado
              </p>
              <p className="mt-1 text-text-muted">
                Eles serão postados na <strong>conta padrão</strong> abaixo (fallback). Para
                granularidade correta no DRE, configure os mapeamentos em{" "}
                <Link to="/settings/payroll" className="text-accent underline">
                  Configurações → Folha
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-1.5">
          <Label>Conta padrão (fallback)</Label>
          <AccountCombobox
            companyId={companyId}
            value={defaultAccountId}
            onChange={setDefaultAccountId}
            kindFilter={["cogs", "personnel_expense", "operating_expense"]}
          />
          <p className="text-2xs text-text-subtle">
            Usada apenas para componentes que ainda não têm mapeamento configurado.
          </p>
        </div>

        {!isLoading && preview.length > 0 && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-2">
            <div className="text-2xs mb-2 px-2 pt-1 font-semibold tracking-wide text-text-subtle uppercase">
              Preview da postagem
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-2xs text-text-subtle">
                    <th className="px-2 py-1.5 text-left">Funcionário</th>
                    <th className="px-2 py-1.5 text-left">Componente</th>
                    <th className="px-2 py-1.5 text-right">Valor</th>
                    <th className="px-2 py-1.5 text-left">Conta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.map((p, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1">{p.employee_name}</td>
                      <td className="px-2 py-1">
                        <span className="text-text">{COMPONENT_META[p.component].label}</span>{" "}
                        <span className="text-2xs text-text-subtle">
                          ({KIND_META[p.employee_kind].label})
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{formatBRL(p.amount)}</td>
                      <td className="px-2 py-1">
                        {p.account_code ? (
                          <span className="text-2xs text-income">
                            {p.account_code} · {p.account_name}
                          </span>
                        ) : (
                          <span className="text-2xs text-expense">⚠ fallback</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SheetBody>
      <SheetFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={!defaultAccountId || isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          Postar {preview.length} lançamento(s)
        </Button>
      </SheetFooter>
    </>
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

function EditableCell({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

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
