import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useBankAccounts } from "./hooks";

interface Props {
  companyId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
  id?: string;
  placeholder?: string;
}

const NONE = "__none__";

export function BankAccountSelect({
  companyId,
  value,
  onChange,
  id,
  placeholder = "Sem conta bancária",
}: Props) {
  const { data: accounts = [], isLoading } = useBankAccounts(companyId);
  // Keep the currently selected account visible even if inactive.
  const options = accounts.filter((a) => a.is_active || a.id === value);

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={isLoading || !companyId}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— {placeholder}</SelectItem>
        {options.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.nickname} · {a.bank_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
