import * as React from "react";
import { Plus, Search } from "lucide-react";
import { parseAsInteger, useQueryStates } from "nuqs";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/features/auth/usePermissions";
import { BillDrawer } from "@/features/bills/components/BillDrawer";
import { BillsAgingCard } from "@/features/bills/components/BillsAgingCard";
import {
  BillsPagination,
  DEFAULT_BILLS_PAGE_SIZE,
} from "@/features/bills/components/BillsPagination";
import { BillsTable } from "@/features/bills/components/BillsTable";
import { PaymentDialog } from "@/features/bills/components/PaymentDialog";
import {
  DEFAULT_DUE_HORIZON,
  DUE_HORIZONS,
  dueLimitFor,
  type DueHorizon,
} from "@/features/bills/dueHorizon";
import { useBills, useBillsAging, useDeleteBill } from "@/features/bills/hooks";
import { ALL_STATUSES, STATUS_META } from "@/features/bills/schema";
import type { BillDirection, BillEffectiveStatus, BillWithRelations } from "@/features/bills/types";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";

type Tab = BillDirection;

const DEFAULT_STATUS: BillEffectiveStatus[] = ["open", "partial", "overdue"];

export default function BillsPage() {
  const { isConsolidated, selectedCompany, selectedCompanyId } = useCompanyScope();
  const { canEdit } = usePermissions();
  const [tab, setTab] = React.useState<Tab>("outflow");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"open" | "all" | "paid">("open");
  const [dueHorizon, setDueHorizon] = React.useState<DueHorizon>(DEFAULT_DUE_HORIZON);
  // Página e tamanho na URL, como nas demais listas: o link continua apontando
  // para o mesmo trecho quando alguém compartilha ou recarrega.
  const [pagination, setPagination] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    pageSize: parseAsInteger.withDefault(DEFAULT_BILLS_PAGE_SIZE),
  });
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BillWithRelations | null>(null);
  const [paying, setPaying] = React.useState<BillWithRelations | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<BillWithRelations | null>(null);

  const effectiveStatuses = React.useMemo<BillEffectiveStatus[] | undefined>(() => {
    if (statusFilter === "all") return undefined;
    if (statusFilter === "paid") return ["paid"];
    return DEFAULT_STATUS;
  }, [statusFilter]);

  const { data, isLoading } = useBills({
    companyId: selectedCompanyId,
    direction: tab,
    status: effectiveStatuses,
    search: search.trim() || null,
    to: dueLimitFor(dueHorizon),
    page: pagination.page,
    pageSize: pagination.pageSize,
  });

  // Mudar qualquer filtro muda o conjunto, e a página antiga deixa de fazer
  // sentido — na melhor hipótese mostra outra coisa, na pior cai fora do fim e
  // fica vazia. O ref preserva a página que veio na URL na primeira renderização.
  const filterKey = [tab, statusFilter, dueHorizon, search.trim(), selectedCompanyId].join("|");
  const lastFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    void setPagination((prev) => ({ ...prev, page: 1 }));
  }, [filterKey, setPagination]);

  // Página além do fim — link antigo, ou filtro que encolheu o conjunto — cairia
  // numa lista vazia sem explicação. Volta para a última página válida.
  React.useEffect(() => {
    const pageCount = data?.pageCount ?? 1;
    if (!isLoading && pagination.page > pageCount) {
      void setPagination((prev) => ({ ...prev, page: pageCount }));
    }
  }, [data?.pageCount, isLoading, pagination.page, setPagination]);

  // O total vem do agregado, não da página: somar as linhas carregadas daria o
  // total da página e passaria por total da empresa.
  const { data: aging = [] } = useBillsAging(selectedCompanyId, tab);
  const totalOpen = aging.reduce((acc, bucket) => acc + (bucket.total ?? 0), 0);

  const deleteMutation = useDeleteBill();

  if (isConsolidated || !selectedCompanyId) {
    return (
      <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
        <Header isConsolidated />
        <Card>
          <CardContent className="p-6 text-center text-sm text-text-muted">
            Selecione uma empresa específica no seletor superior para gerenciar contas a pagar e a
            receber.
          </CardContent>
        </Card>
      </div>
    );
  }

  const directionLabel = tab === "outflow" ? "A Pagar" : "A Receber";
  const rows = data?.rows ?? [];

  return (
    <div className="mx-auto max-w-[var(--content-max-width)] space-y-5 p-6 lg:p-8">
      <Header
        companyName={selectedCompany?.trade_name ?? selectedCompany?.legal_name ?? "—"}
        directionLabel={directionLabel}
        totalOpen={totalOpen}
        canEdit={canEdit}
        onCreate={() => {
          setEditing(null);
          setDrawerOpen(true);
        }}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "outflow"} onClick={() => setTab("outflow")}>
          A Pagar
        </TabButton>
        <TabButton active={tab === "inflow"} onClick={() => setTab("inflow")}>
          A Receber
        </TabButton>
      </div>

      <BillsAgingCard companyId={selectedCompanyId} direction={tab} />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" />
          <Input
            placeholder="Buscar por descrição…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Em aberto / Vencidos</SelectItem>
            <SelectItem value="paid">Pagos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dueHorizon} onValueChange={(v) => setDueHorizon(v as DueHorizon)}>
          <SelectTrigger className="w-48" aria-label="Vencimento até">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUE_HORIZONS.map((h) => (
              <SelectItem key={h.value} value={h.value}>
                {h.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <BillsTable
        rows={rows}
        loading={isLoading}
        canEdit={canEdit}
        onEdit={(bill) => {
          setEditing(bill);
          setDrawerOpen(true);
        }}
        onDelete={(bill) => setConfirmDelete(bill)}
        onPay={(bill) => setPaying(bill)}
      />

      <BillsPagination
        page={pagination.page}
        pageCount={data?.pageCount ?? 1}
        totalCount={data?.totalCount ?? 0}
        rowsOnPage={rows.length}
        pageSize={pagination.pageSize}
        onPageChange={(page) => void setPagination((prev) => ({ ...prev, page }))}
        // Trocar o tamanho reposiciona tudo: manter a página levaria para além
        // do fim quando o tamanho cresce.
        onPageSizeChange={(pageSize) => void setPagination({ page: 1, pageSize })}
      />

      {/* Status summary */}
      {!isLoading && rows.length > 0 && <StatusSummary rows={rows} />}

      <BillDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        bill={editing}
        companyId={selectedCompanyId}
        direction={tab}
      />

      <PaymentDialog bill={paying} onOpenChange={(open) => !open && setPaying(null)} />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Excluir título"
        description={
          <>
            Excluir <strong>{confirmDelete?.description}</strong>? Esta ação faz soft-delete (pode
            ser revertido no log de auditoria).
          </>
        }
        confirmLabel="Excluir"
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (!confirmDelete?.id) return;
          deleteMutation.mutate(confirmDelete.id, {
            onSuccess: () => {
              toast.success("Título excluído");
              setConfirmDelete(null);
            },
            onError: (err) => toast.error("Erro ao excluir", { description: err.message }),
          });
        }}
      />
    </div>
  );
}

interface HeaderProps {
  isConsolidated?: boolean;
  companyName?: string;
  directionLabel?: string;
  totalOpen?: number;
  canEdit?: boolean;
  onCreate?: () => void;
}

function Header({
  isConsolidated,
  companyName,
  directionLabel,
  totalOpen,
  canEdit,
  onCreate,
}: HeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
          Contas {directionLabel ?? "a Pagar / a Receber"}
        </div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          {isConsolidated ? "Consolidado" : companyName}
        </h1>
        {!isConsolidated && totalOpen !== undefined && (
          <p className="mt-1 text-sm text-text-muted">
            Total em aberto:{" "}
            <span className="font-mono font-semibold text-text">{formatBRL(totalOpen)}</span>
          </p>
        )}
      </div>
      {canEdit && onCreate && (
        <Button onClick={onCreate} size="sm">
          <Plus className="size-4" /> Novo título
        </Button>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function StatusSummary({ rows }: { rows: BillWithRelations[] }) {
  const counts = ALL_STATUSES.map((s) => ({
    status: s,
    count: rows.filter((r) => r.effective_status === s).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
      {/* "Nesta página" porque a contagem é das linhas carregadas: com paginação,
          "20 títulos" seco passaria por total do filtro. */}
      <span>Nesta página: {rows.length} título(s) ·</span>
      {counts.map((c) => (
        <span key={c.status} className="inline-flex items-center gap-1.5">
          <span className={`size-2 rounded-full bg-${STATUS_META[c.status].tone}`} />
          {STATUS_META[c.status].label}: <strong className="text-text">{c.count}</strong>
        </span>
      ))}
    </div>
  );
}
