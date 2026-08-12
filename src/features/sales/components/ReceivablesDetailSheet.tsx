import { Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/dates";
import { formatBRL, formatNumber } from "@/lib/format";

import { useReceivablesOfTransaction } from "../hooks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string | null;
  title: string;
}

/**
 * O lastro de um título gerado pela projeção.
 *
 * Um lançamento da projeção agrega TODAS as parcelas que liquidam no mesmo dia
 * dentro da mesma competência — sem este detalhe o valor em "A Receber" seria um
 * número sem rastro. Somente leitura de propósito: o título é derivado dos
 * recebíveis e é regenerado a cada sincronização, então editá-lo à mão não teria
 * efeito duradouro.
 */
export function ReceivablesDetailSheet({ open, onOpenChange, transactionId, title }: Props) {
  const { data, isLoading } = useReceivablesOfTransaction(open ? transactionId : null);

  const totals = (data ?? []).reduce(
    (acc, r) => ({
      gross: acc.gross + r.amount,
      fees: acc.fees + r.feeTotal,
      net: acc.net + r.netAmount,
    }),
    { gross: 0, fees: 0, net: 0 },
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Parcelas do pagar.me</SheetTitle>
          <SheetDescription>{title}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">
            Nenhuma parcela vinculada a este lançamento. Se ele foi criado antes da última
            sincronização, rode a projeção novamente para reamarrar.
          </p>
        ) : (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-3 gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
              <Total label="Bruto" value={formatBRL(totals.gross)} />
              <Total label="Taxas" value={formatBRL(totals.fees)} tone="expense" />
              <Total label="Líquido" value={formatBRL(totals.net)} tone="income" />
            </div>

            <p className="text-xs text-text-muted">
              {formatNumber(data.length)} {data.length === 1 ? "parcela" : "parcelas"} compõem este
              título.
            </p>

            <ul className="divide-y divide-border">
              {data.map((r) => (
                <li key={r.receivableId} className="flex flex-wrap gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {r.customerName ?? "Cliente não visível"}
                      {r.anticipated ? (
                        <Badge tone="warning">
                          <Zap className="size-3" /> antecipado
                        </Badge>
                      ) : null}
                      {r.status === "paid" ? <Badge tone="income">liquidado</Badge> : null}
                    </div>
                    <div className="text-2xs text-text-subtle">
                      {r.installment && r.installmentsTotal
                        ? `Parcela ${r.installment}/${r.installmentsTotal} · `
                        : ""}
                      {r.paymentMethod ?? "—"}
                      {r.cardBrand ? ` · ${r.cardBrand}` : ""}
                      {r.salePaidAt ? ` · venda em ${formatDate(r.salePaidAt)}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-mono">{formatBRL(r.amount)}</div>
                    <div className="text-2xs text-text-subtle">
                      taxa {formatBRL(r.feeTotal)} · líq. {formatBRL(r.netAmount)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Total({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "income" | "expense";
}) {
  const toneClass =
    tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : undefined;
  return (
    <div>
      <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">{label}</div>
      <div className={`font-display text-base font-semibold ${toneClass ?? ""}`.trim()}>
        {value}
      </div>
    </div>
  );
}
