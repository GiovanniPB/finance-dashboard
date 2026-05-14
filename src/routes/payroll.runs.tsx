import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { useCreatePayrollRun, useDeletePayrollRun, usePayrollRuns } from "@/features/payroll/hooks";
import { cn } from "@/lib/cn";
import { formatMonthYear } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

const STATUS_META: Record<
  string,
  { label: string; tone: "default" | "accent" | "income" | "warning" }
> = {
  draft: { label: "Rascunho", tone: "warning" },
  approved: { label: "Aprovado", tone: "accent" },
  posted: { label: "Postado", tone: "income" },
};

export default function PayrollRunsPage() {
  const { companies, selectedCompanyId, isConsolidated } = useCompanyScope();
  const operational = companies.filter((c) => !c.is_holding);

  const [pickedCompanyId, setPickedCompanyId] = React.useState<string | null>(
    isConsolidated ? (operational[0]?.id ?? null) : selectedCompanyId,
  );
  React.useEffect(() => {
    if (!isConsolidated) setPickedCompanyId(selectedCompanyId);
  }, [isConsolidated, selectedCompanyId]);

  const companyId = pickedCompanyId;

  const { data: runs = [], isLoading } = usePayrollRuns(companyId);
  const create = useCreatePayrollRun();
  const deleteRun = useDeletePayrollRun();
  const [confirmDelete, setConfirmDelete] = React.useState<{ id: string; label: string } | null>(
    null,
  );

  function handleConfirmDelete() {
    if (!confirmDelete) return;
    deleteRun.mutate(confirmDelete.id, {
      onSuccess: () => {
        toast.success("Folha excluída");
        setConfirmDelete(null);
      },
      onError: (err) => toast.error("Erro ao excluir", { description: err.message }),
    });
  }

  const [createOpen, setCreateOpen] = React.useState(false);
  const [refMonth, setRefMonth] = React.useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });

  function handleCreate() {
    if (!companyId) return;
    create.mutate(
      { companyId, referenceMonth: refMonth },
      {
        onSuccess: () => {
          toast.success("Folha criada com base nos colaboradores ativos");
          setCreateOpen(false);
        },
        onError: (err) => toast.error("Erro ao criar folha", { description: err.message }),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Folhas mensais</h2>
          <p className="mt-1 text-sm text-text-muted">{runs.length} folha(s) na empresa</p>
        </div>
        <div className="flex items-end gap-2">
          {isConsolidated && operational.length > 0 && (
            <Select value={companyId ?? undefined} onValueChange={(v) => setPickedCompanyId(v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {operational.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.trade_name ?? c.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button disabled={!companyId} onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Nova folha
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
          Nenhuma folha cadastrada ainda. Clique em "Nova folha" para criar.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60">
              <tr className="border-b border-border">
                <Th>Mês de referência</Th>
                <Th>Status</Th>
                <Th align="right">Total fixo</Th>
                <Th align="right">Variável + bônus</Th>
                <Th align="right">Encargos</Th>
                <Th align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => {
                const meta = STATUS_META[row.status] ??
                  STATUS_META.draft ?? { label: row.status, tone: "default" as const };
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="px-4 py-3 font-medium capitalize">
                      {formatMonthYear(row.reference_month)}
                      {row.posted_at && (
                        <span className="text-2xs ml-2 inline-flex items-center gap-1 text-income">
                          <CheckCircle2 className="size-3" /> postada
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatBRL(row.total_fixed)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatBRL(row.total_variable)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-muted tabular-nums">
                      {formatBRL(row.total_charges)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/payroll/runs/${row.id}`}>
                            Abrir <ArrowRight className="size-3.5" />
                          </Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              aria-label="Ações"
                              className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-surface-2 hover:text-text"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() =>
                                setConfirmDelete({
                                  id: row.id,
                                  label: formatMonthYear(row.reference_month),
                                })
                              }
                              className="text-expense focus:bg-expense-soft focus:text-expense"
                            >
                              <Trash2 className="size-4" /> Excluir folha
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
        title={`Excluir folha de ${confirmDelete?.label ?? ""}?`}
        description="Os lançamentos vinculados também serão removidos. Esta ação não pode ser desfeita."
        confirmLabel="Excluir folha"
        pending={deleteRun.isPending}
        onConfirm={handleConfirmDelete}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent size="sm" className="flex flex-col p-0">
          <SheetHeader>
            <SheetTitle>Nova folha mensal</SheetTitle>
            <SheetDescription>
              Cria a folha e pré-popula os itens com o salário-base de cada colaborador ativo. Você
              poderá ajustar antes de postar.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="refMonth">Mês de referência</Label>
              <Input
                id="refMonth"
                type="date"
                value={refMonth}
                onChange={(e) => setRefMonth(e.target.value)}
              />
              <p className="text-2xs text-text-subtle">
                Use o primeiro dia do mês (ex: 2025-08-01).
              </p>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={create.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Criar folha
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "text-2xs px-4 py-2.5 font-medium tracking-wide text-text-subtle uppercase",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
