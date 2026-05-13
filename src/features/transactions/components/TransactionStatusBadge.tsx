import { Badge } from "@/components/ui/badge";

import type { TransactionStatus } from "../types";

const STATUS_META: Record<
  TransactionStatus,
  { label: string; tone: "default" | "accent" | "income" | "expense" | "warning" | "info" }
> = {
  scheduled: { label: "Agendado", tone: "info" },
  pending: { label: "Pendente", tone: "warning" },
  settled: { label: "Liquidado", tone: "income" },
  reconciled: { label: "Conciliado", tone: "accent" },
  canceled: { label: "Cancelado", tone: "default" },
};

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
