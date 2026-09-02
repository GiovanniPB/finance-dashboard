import * as React from "react";
import {
  Briefcase,
  CheckCircle2,
  GraduationCap,
  Loader2,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
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
import { useSingleCompanyPicker } from "@/features/companies/useSingleCompanyPicker";
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

const KIND_ICON: Record<EmployeeKind, typeof Users> = {
  partner: Briefcase,
  clt: Users,
  pj: Briefcase,
  intern: GraduationCap,
};

// Partners and interns typically don't have employer charges nor employee withholdings.
const HIDDEN_COMPONENTS: Partial<Record<EmployeeKind, PayrollComponent[]>> = {
  partner: ["fgts", "benefits", "irrf_withheld", "inss_withheld"],
  intern: ["fgts", "irrf_withheld", "inss_withheld"],
  pj: ["fgts", "benefits", "irrf_withheld", "inss_withheld"],
};

export default function SettingsPayrollPage() {
  // Tela que OPERA numa empresa: num escopo com várias (consolidado ou grupo de
  // agregação), escolhe-se qual — sempre entre as empresas do escopo.
  const {
    companyId,
    setCompanyId,
    options: scopeCompanies,
    needsPicker,
  } = useSingleCompanyPicker();
  const [activeKind, setActiveKind] = React.useState<EmployeeKind>("partner");
  const { data: mappings = [], isLoading } = usePayrollMappings(companyId);
  const setupDefaults = useSetupDefaults();
  const upsertMutation = useUpsertMapping();
  const deleteMutation = useDeleteMapping();

  const matrix = React.useMemo(() => {
    const m = new Map<string, PayrollMappingWithAccount>();
    for (const row of mappings) m.set(`${row.employee_kind}|${row.component}`, row);
    return m;
  }, [mappings]);

  // Count configured mappings per kind for tab badges
  const counts = React.useMemo(() => {
    const c: Record<EmployeeKind, { configured: number; total: number }> = {
      partner: { configured: 0, total: 0 },
      clt: { configured: 0, total: 0 },
      pj: { configured: 0, total: 0 },
      intern: { configured: 0, total: 0 },
    };
    for (const kind of KIND_ORDER) {
      const hidden = HIDDEN_COMPONENTS[kind] ?? [];
      const visible = COMPONENT_ORDER.filter((c) => !hidden.includes(c));
      c[kind].total = visible.length;
      c[kind].configured = visible.filter((comp) => matrix.has(`${kind}|${comp}`)).length;
    }
    return c;
  }, [matrix]);

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Folha de pagamento</h2>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Define em qual conta DRE cada componente da folha é postado, por tipo de funcionário. A
            rodada de folha gera uma transação por componente, em vez de um único lançamento
            agregado.
          </p>
        </div>
        {needsPicker && (
          <Select value={companyId ?? ""} onValueChange={(v) => setCompanyId(v)}>
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeCompanies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.trade_name ?? c.legal_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Apply defaults card */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <RefreshCw className="size-4" />
            </div>
            <div className="min-w-[280px] flex-1">
              <div className="text-sm font-semibold">Aplicar padrões OTM Group</div>
              <p className="mt-0.5 text-xs text-text-muted">
                Preenche o mapeamento usando seu plano de contas. Cria automaticamente{" "}
                <strong>2.10 IRRF a Recolher</strong> e <strong>2.11 INSS a Recolher</strong> se
                faltarem. Idempotente — não sobrescreve o que já configurou.
              </p>
            </div>
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

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {KIND_ORDER.map((kind) => {
          const meta = KIND_META[kind];
          const Icon = KIND_ICON[kind];
          const c = counts[kind];
          const active = activeKind === kind;
          const complete = c.configured === c.total;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setActiveKind(kind)}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              <Icon className="size-4" />
              {meta.label}
              <Badge
                tone={complete ? "income" : c.configured === 0 ? "default" : "warning"}
                className="ml-1"
              >
                {c.configured}/{c.total}
              </Badge>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <KindPanel
          kind={activeKind}
          companyId={companyId}
          matrix={matrix}
          onSet={handleSetMapping}
          onClear={handleClear}
          isMutating={upsertMutation.isPending || deleteMutation.isPending}
        />
      )}
    </div>
  );
}

interface KindPanelProps {
  kind: EmployeeKind;
  companyId: string | null;
  matrix: Map<string, PayrollMappingWithAccount>;
  onSet: (kind: EmployeeKind, component: PayrollComponent, accountId: string) => void;
  onClear: (mappingId: string) => void;
  isMutating: boolean;
}

function KindPanel({ kind, companyId, matrix, onSet, onClear, isMutating }: KindPanelProps) {
  const meta = KIND_META[kind];
  const Icon = KIND_ICON[kind];
  const hidden = HIDDEN_COMPONENTS[kind] ?? [];
  const visibleComponents = COMPONENT_ORDER.filter((c) => !hidden.includes(c));

  return (
    <div className="space-y-4">
      {/* Kind header */}
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent-soft text-accent">
          <Icon className="size-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">{meta.label}</div>
          <p className="text-xs text-text-muted">{meta.description}</p>
          {hidden.length > 0 && (
            <p className="text-2xs mt-1 text-text-subtle">
              Componentes ocultos por convenção ({hidden.length}): este tipo normalmente não tem{" "}
              {hidden.map((h) => COMPONENT_META[h].label.toLowerCase()).join(", ")}.
            </p>
          )}
        </div>
      </div>

      {/* Component rows */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {visibleComponents.map((comp) => {
          const row = matrix.get(`${kind}|${comp}`);
          const componentMeta = COMPONENT_META[comp];
          return (
            <Card key={comp} className={cn(isMutating && "opacity-70")}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{componentMeta.label}</span>
                      {componentMeta.isLiability && <Badge tone="info">Passivo</Badge>}
                      {row && <CheckCircle2 className="size-3.5 text-income" />}
                    </div>
                    <p className="text-2xs mt-0.5 text-text-subtle">{componentMeta.description}</p>
                  </div>
                  {row && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onClear(row.id)}
                      aria-label="Limpar mapeamento"
                      className="text-expense hover:bg-expense-soft hover:text-expense"
                      title="Limpar"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
                <AccountCombobox
                  companyId={companyId}
                  value={row?.account_id ?? null}
                  onChange={(id) => onSet(kind, comp, id)}
                  placeholder="Selecione a conta DRE…"
                />
                {row?.account && (
                  <div className="text-2xs flex items-center gap-1 truncate text-income">
                    <CheckCircle2 className="size-3 shrink-0" />
                    <span className="font-mono">{row.account.code}</span>
                    <span className="truncate">· {row.account.name}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
