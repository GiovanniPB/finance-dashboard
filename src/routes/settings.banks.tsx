import * as React from "react";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type BankAccount } from "@/features/bank-accounts/api";
import { BankAccountDeleteDialog } from "@/features/bank-accounts/components/BankAccountDeleteDialog";
import { BankAccountDrawer } from "@/features/bank-accounts/components/BankAccountDrawer";
import { BankAccountsTable } from "@/features/bank-accounts/components/BankAccountsTable";
import { useBankAccounts, useToggleBankAccountActive } from "@/features/bank-accounts/hooks";
import { useSingleCompanyPicker } from "@/features/companies/useSingleCompanyPicker";

export default function SettingsBanksPage() {
  // Contas bancárias são de UMA empresa; num escopo com várias (consolidado ou grupo),
  // a tela pede que se escolha qual — entre as do escopo.
  const {
    companyId,
    setCompanyId,
    options: scopeCompanies,
    needsPicker,
  } = useSingleCompanyPicker();
  const { data: rows = [], isLoading } = useBankAccounts(companyId);
  const toggleActive = useToggleBankAccountActive();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BankAccount | null>(null);
  const [deleting, setDeleting] = React.useState<BankAccount | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Contas bancárias</h2>
          <p className="mt-1 text-sm text-text-muted">
            {needsPicker
              ? "Escolha uma empresa para gerenciar suas contas."
              : "Contas vinculadas a esta empresa."}
          </p>
        </div>
        <div className="flex items-end gap-2">
          {needsPicker && (
            <Select value={companyId ?? undefined} onValueChange={(v) => setCompanyId(v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Selecione…" />
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
          <Button
            disabled={!companyId}
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="size-4" /> Nova conta
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <Badge>{rows.length} contas</Badge>
          <span>
            {rows.filter((r) => r.is_active).length} ativa(s),{" "}
            {rows.filter((r) => !r.is_active).length} inativa(s)
          </span>
        </div>
      )}

      <BankAccountsTable
        rows={rows}
        loading={isLoading}
        onEdit={(a) => {
          setEditing(a);
          setDrawerOpen(true);
        }}
        onToggleActive={(a) => toggleActive.mutate({ id: a.id, isActive: !a.is_active })}
        onDelete={(a) => setDeleting(a)}
      />

      {companyId && (
        <BankAccountDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          account={editing}
          companyId={companyId}
        />
      )}

      <BankAccountDeleteDialog account={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
