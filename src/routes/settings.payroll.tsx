import * as React from "react";
import { CheckCircle2, Loader2, RefreshCw, Trash2 } from "lucide-react";
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
import { AccountCombobox } from "@/features/accounts/AccountCombobox";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import type {
  EmployeeKind,
  PayrollComponent,
  PayrollMappingWithAccount,
} from "@/features/payroll-mappings/api";
import {
  COMPONENT_META,
  COMPONENT_ORDER,
  KIND_META,
  KIND_ORDER,
} from "@/features/payroll-mappings/constants";
import {
  useDeleteMapping,
  usePayrollMappings,
  useSetupDefaults,
  useUpsertMapping,
} from "@/features/payroll-mappings/hooks";
import { cn } from "@/lib/cn";

export default function SettingsPayrollPage() {
  const { companies, selectedCompanyId, isConsolidated } = useCompanyScope();
  const operational = companies.filter((c) => !c.is_holding);

  const [pickedCompanyId, setPickedCompanyId] = React.useState<string | null>(
    isConsolidated ? (operational[0]?.id ?? null) : selectedCompanyId,
  );
  React.useEffect(() => {
    if (!isConsolidated) setPickedCompanyId(selectedCompanyId);
  }, [isConsolidated, selectedCompanyId]);

  const companyId = pickedCompanyId;
  const { data: mappings = [], isLoading } = usePayrollMappings(companyId);
  const setupDefaults = useSetupDefaults();
  const upsertMutation = useUpsertMapping();
  const deleteMutation = useDeleteMapping();

  // Index mappings by (kind, component) for O(1) lookup
  const matrix = React.useMemo(() => {
    const m = new Map<string, PayrollMappingWithAccount>();
    for (const row of mappings) {
      m.set(`${row.employee_kind}|${row.component}`, row);
    }
    return m;
  }, [mappings]);

  const handleApplyDefaults = () => {
    if (!companyId) return;
    setupDefaults.mutate(companyId, {
      onSuccess: (rows) =>
        toast.success(
          `${rows.length} mapeamento(s) configurados (cria contas 2.10/2.11 se faltarem)`,
        ),
      onError: (err) => toast.error("Erro ao aplicar padrões", { description: err.message }),
    });
  };

  const handleSetMapping = (kind: EmployeeKind, component: PayrollComponent, accountId: string) => {
    if (!companyId) return;
    upsertMutation.mutate(
      { company_id: companyId, employee_kind: kind, component, account_id: accountId },
      {
        onSuccess: () => toast.success("Mapeamento salvo"),
        onError: (err) => toast.error("Erro ao salvar", { description: err.message }),
      },
    );
  };

  const handleClear = (mappingId: string) => {
    deleteMutation.mutate(mappingId, {
      onSuccess: () => toast.success("Mapeamento removido"),
      onError: (err) => toast.error("Erro ao remover", { description: err.message }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Folha de pagamento</h2>
          <p className="mt-1 text-sm text-text-muted">
            Define em qual conta DRE cada componente da folha é postado, por tipo de funcionário.
            Postagem da rodada gera uma transação por componente, em vez de um único lançamento
            agregado.
          </p>
        </div>
        {isConsolidated && operational.length > 1 && (
          <Select value={pickedCompanyId ?? ""} onValueChange={(v) => setPickedCompanyId(v)}>
            <SelectTrigger className="w-60">
              <SelectValue />
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
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div className="min-w-[280px] flex-1">
            <div className="text-2xs font-semibold tracking-wide text-text-subtle uppercase">
              Aplicar padrões OTM Group
            </div>
            <p className="mt-1 text-sm text-text-muted">
              Preenche o mapeamento usando os códigos do seu plano de contas (4.01/4.02 para sócios,
              6.1.01/02/06 para CLT). Cria automaticamente as contas{" "}
              <strong>2.10 IRRF a Recolher</strong> e <strong>2.11 INSS a Recolher</strong> se ainda
              não existirem.
              <br />
              <span className="text-2xs">
                Idempotente: não sobrescreve mapeamentos já configurados.
              </span>
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleApplyDefaults}
            disabled={!companyId || setupDefaults.isPending}
          >
            {setupDefaults.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Aplicar padrões
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                <th className="px-3 py-2.5 text-left">Componente</th>
                {KIND_ORDER.map((k) => (
                  <th key={k} className="px-3 py-2.5 text-left">
                    {KIND_META[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COMPONENT_ORDER.map((comp) => {
                const meta = COMPONENT_META[comp];
                return (
                  <tr key={comp} className="align-top">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {meta.label}
                        {meta.isLiability && <Badge tone="info">Passivo</Badge>}
                      </div>
                      <div className="text-2xs mt-0.5 max-w-[260px] text-text-subtle">
                        {meta.description}
                      </div>
                    </td>
                    {KIND_ORDER.map((kind) => {
                      const row = matrix.get(`${kind}|${comp}`);
                      return (
                        <td key={kind} className="min-w-[260px] px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1">
                              <AccountCombobox
                                companyId={companyId}
                                value={row?.account_id ?? null}
                                onChange={(id) => handleSetMapping(kind, comp, id)}
                                placeholder={
                                  meta.isLiability && (kind === "partner" || kind === "intern")
                                    ? "Não se aplica"
                                    : "Sem mapeamento"
                                }
                              />
                            </div>
                            {row && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleClear(row.id)}
                                aria-label="Remover"
                                className="text-expense hover:bg-expense-soft hover:text-expense"
                                title="Remover mapeamento"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                          {row?.account && (
                            <div
                              className={cn(
                                "text-2xs mt-1 inline-flex items-center gap-1 text-income",
                              )}
                            >
                              <CheckCircle2 className="size-3" />
                              {row.account.code} · {row.account.name}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
