import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";

import type { SalesBreakdownRow, SalesDimension } from "../api";

const DIMENSION_LABELS: Record<SalesDimension, string> = {
  payment_method: "Meio de pagamento",
  installments: "Parcelamento",
  plan: "Plano / produto",
  brand: "Bandeira",
  company: "Empresa (split)",
};

const DIMENSION_HINTS: Record<SalesDimension, string> = {
  payment_method: "Como o cliente pagou.",
  installments: "Em quantas vezes a venda foi feita.",
  plan: "Plano do pagar.me; “avulso” é venda sem plano.",
  brand: "Bandeira do cartão.",
  company: "Quanto cada empresa do grupo recebe do split — sai dos recebíveis, não da venda.",
};

interface Props {
  data: SalesBreakdownRow[] | undefined;
  loading: boolean;
  dimension: SalesDimension;
  onDimensionChange: (dimension: SalesDimension) => void;
}

export function SalesBreakdownCard({ data, loading, dimension, onDimensionChange }: Props) {
  const total = (data ?? []).reduce((acc, r) => acc + r.amount, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Composição das vendas</CardTitle>
            <CardDescription>{DIMENSION_HINTS[dimension]}</CardDescription>
          </div>
          <Select value={dimension} onValueChange={(v) => onDimensionChange(v as SalesDimension)}>
            <SelectTrigger className="w-[200px]" aria-label="Dimensão">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DIMENSION_LABELS) as SalesDimension[]).map((d) => (
                <SelectItem key={d} value={d}>
                  {DIMENSION_LABELS[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            Nada a compor no período selecionado.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {data.map((row) => {
              const share = total > 0 ? row.amount / total : 0;
              return (
                <li key={row.label} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{row.label}</span>
                    <span className="shrink-0 tabular-nums">
                      {formatBRL(row.amount)}
                      <span className="ml-2 text-xs text-text-muted">
                        {formatPercent(share)} · {formatNumber(row.salesCount)}
                      </span>
                    </span>
                  </div>
                  {/* barra proporcional: leitura da composição sem precisar de gráfico */}
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(share * 100, 1)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
