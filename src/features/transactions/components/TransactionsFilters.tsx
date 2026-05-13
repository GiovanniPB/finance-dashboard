import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAccountsByCompany } from "@/features/accounts/hooks";

import { useTransactionFilters } from "../useTransactionFilters";

interface Props {
  companyId: string | null;
}

export function TransactionsFilters({ companyId }: Props) {
  const [filters, setFilters] = useTransactionFilters();
  const { data: accounts = [] } = useAccountsByCompany(companyId);

  const hasAny = Boolean(
    filters.from ??
    filters.to ??
    filters.status ??
    filters.direction ??
    filters.accountId ??
    filters.search,
  );

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="search">Buscar</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" />
          <Input
            id="search"
            placeholder="Descrição do lançamento…"
            value={filters.search}
            onChange={(e) => void setFilters({ search: e.target.value })}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="from">De</Label>
        <Input
          id="from"
          type="date"
          value={filters.from}
          onChange={(e) => void setFilters({ from: e.target.value })}
          className="w-[150px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="to">Até</Label>
        <Input
          id="to"
          type="date"
          value={filters.to}
          onChange={(e) => void setFilters({ to: e.target.value })}
          className="w-[150px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="direction">Tipo</Label>
        <Select
          id="direction"
          value={filters.direction ?? ""}
          onChange={(e) =>
            void setFilters({
              direction: e.target.value === "" ? null : (e.target.value as "inflow" | "outflow"),
            })
          }
        >
          <option value="">Todos</option>
          <option value="inflow">Entrada</option>
          <option value="outflow">Saída</option>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <Select
          id="status"
          value={filters.status ?? ""}
          onChange={(e) =>
            void setFilters({
              status:
                e.target.value === ""
                  ? null
                  : (e.target.value as
                      | "scheduled"
                      | "pending"
                      | "settled"
                      | "reconciled"
                      | "canceled"),
            })
          }
        >
          <option value="">Todos</option>
          <option value="scheduled">Agendado</option>
          <option value="pending">Pendente</option>
          <option value="settled">Liquidado</option>
          <option value="reconciled">Conciliado</option>
          <option value="canceled">Cancelado</option>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account">Conta</Label>
        <Select
          id="account"
          value={filters.accountId}
          onChange={(e) => void setFilters({ accountId: e.target.value })}
          disabled={!companyId}
        >
          <option value="">Todas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </Select>
      </div>

      {hasAny && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void setFilters({
              from: "",
              to: "",
              status: null,
              direction: null,
              accountId: "",
              costCenterId: "",
              bankAccountId: "",
              search: "",
            })
          }
        >
          <X className="size-3.5" /> Limpar
        </Button>
      )}
    </div>
  );
}
