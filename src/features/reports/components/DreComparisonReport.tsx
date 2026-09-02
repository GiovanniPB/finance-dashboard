import { ArrowDown, ArrowUp, Download, Minus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatBRL, formatPercent } from "@/lib/format";

import type { DreComparisonRow } from "../api";
import { useDreComparison } from "../hooks";

interface Props {
  /** Empresa única do escopo (nulo em consolidado e em grupo). */
  companyId: string | null;
  organizationId: string;
  companyIds: string[] | null;
  /** Escopo com mais de uma empresa: agrega pelo plano-mestre. */
  aggregated: boolean;
  aFrom: string;
  aTo: string;
  bFrom: string;
  bTo: string;
  labelA: string;
  labelB: string;
}

export function DreComparisonReport({
  companyId,
  organizationId,
  companyIds,
  aggregated,
  aFrom,
  aTo,
  bFrom,
  bTo,
  labelA,
  labelB,
}: Props) {
  const { data = [], isLoading } = useDreComparison({
    companyId,
    organizationId,
    companyIds,
    aggregated,
    aFrom,
    aTo,
    bFrom,
    bTo,
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (data.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface p-12 text-center text-sm text-text-muted">
        Nenhum dado para comparar nos períodos selecionados.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const csv = toCsv<DreComparisonRow>(data, [
              { key: "code", header: "Código", getValue: (r) => r.code },
              { key: "name", header: "Conta", getValue: (r) => r.name },
              { key: "a", header: labelA, getValue: (r) => r.totalA.toFixed(2) },
              { key: "b", header: labelB, getValue: (r) => r.totalB.toFixed(2) },
              { key: "var_abs", header: "Variação R$", getValue: (r) => r.varianceAbs.toFixed(2) },
              {
                key: "var_pct",
                header: "Variação %",
                getValue: (r) => (r.variancePct == null ? "" : r.variancePct.toFixed(1)),
              },
            ]);
            downloadCsv(`dre-comparativo-${aFrom}-${aTo}_vs_${bFrom}-${bTo}.csv`, csv);
          }}
        >
          <Download className="size-3.5" /> Exportar CSV
        </Button>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
              <th className="px-3 py-2.5 text-left">Conta</th>
              <th className="px-3 py-2.5 text-right">{labelA}</th>
              <th className="px-3 py-2.5 text-right">{labelB}</th>
              <th className="px-3 py-2.5 text-right">Variação</th>
              <th className="px-3 py-2.5 text-right">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((r) => (
              <tr
                key={r.accountId ?? `${r.code}-${r.name}`}
                className={cn(
                  "hover:bg-surface-2/60",
                  r.isSummary && "bg-surface-2/40 font-semibold",
                )}
              >
                <td className="px-3 py-2">
                  <div className="text-sm">{r.name}</div>
                  <div className="text-2xs font-mono text-text-subtle">{r.code}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatBRL(r.totalA)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatBRL(r.totalB)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono text-xs font-semibold",
                    r.varianceAbs > 0
                      ? "text-income"
                      : r.varianceAbs < 0
                        ? "text-expense"
                        : "text-text-muted",
                  )}
                >
                  {formatBRL(r.varianceAbs)}
                </td>
                <td className="px-3 py-2 text-right">
                  <VarianceIndicator pct={r.variancePct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VarianceIndicator({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-2xs font-mono text-text-subtle">—</span>;
  }
  const Icon = pct > 0 ? ArrowUp : pct < 0 ? ArrowDown : Minus;
  const tone = pct > 0 ? "text-income" : pct < 0 ? "text-expense" : "text-text-muted";
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mono text-xs", tone)}>
      <Icon className="size-3" />
      {formatPercent(pct, { fromHundred: true })}
    </span>
  );
}
