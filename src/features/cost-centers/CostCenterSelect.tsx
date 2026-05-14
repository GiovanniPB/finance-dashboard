import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCostCenters } from "./hooks";

interface Props {
  companyId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
  id?: string;
  placeholder?: string;
}

const NONE = "__none__";

export function CostCenterSelect({
  companyId,
  value,
  onChange,
  id,
  placeholder = "Sem centro de custo",
}: Props) {
  const { data: costCenters = [], isLoading } = useCostCenters(companyId);
  const active = costCenters.filter((c) => c.is_active);

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={isLoading}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— {placeholder}</SelectItem>
        {active.map((cc) => (
          <SelectItem key={cc.id} value={cc.id}>
            {cc.code} · {cc.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
