import { Badge } from "@/components/ui/badge";

import { STATUS_META } from "../schema";
import type { BillEffectiveStatus } from "../types";

interface Props {
  status: BillEffectiveStatus;
  daysOverdue?: number | null;
}

export function BillStatusBadge({ status, daysOverdue }: Props) {
  const meta = STATUS_META[status];
  const suffix = status === "overdue" && daysOverdue ? ` (${daysOverdue}d)` : "";
  return (
    <Badge tone={meta.tone}>
      {meta.label}
      {suffix}
    </Badge>
  );
}
