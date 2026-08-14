import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";

/** Série categórica dos gráficos de composição. Ver tokens.css. */
export const SERIES_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
] as const;

export const seriesColor = (i: number): string => SERIES_COLORS[i % SERIES_COLORS.length];

/** Estilo do tooltip do Recharts — repetido em todo gráfico do projeto. */
export const TOOLTIP_STYLE = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
} as const;

export const AXIS_TICK = { fill: "var(--color-text-muted)", fontSize: 11 } as const;

interface BreakdownCardProps {
  title: string;
  description: string;
  loading: boolean;
  isEmpty: boolean;
  /** Altura fixa: mantém o esqueleto e o vazio do mesmo tamanho do gráfico. */
  height?: number;
  emptyLabel?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Casca comum dos cards de composição.
 *
 * Cada dimensão ganhou o gráfico que a representa (rosca para parte-de-todo,
 * barra ordenada para o parcelamento, ranking horizontal para plano). O que elas
 * compartilham é só o invólucro — título, total, carregando e vazio — que fica
 * aqui para os cinco não divergirem.
 */
export function BreakdownCard({
  title,
  description,
  loading,
  isEmpty,
  height = 260,
  emptyLabel = "Nada a compor no período selecionado.",
  aside,
  children,
}: BreakdownCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {!loading && !isEmpty ? aside : null}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : isEmpty ? (
          <div
            className="grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-border text-sm text-text-muted"
            style={{ height }}
          >
            {emptyLabel}
          </div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** Total do card, alinhado à direita do cabeçalho. */
export function TotalAside({ value, hint }: { value: number; hint: string }) {
  return (
    <div className="text-right">
      <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">Total</div>
      <div className="font-display text-xl font-semibold tracking-tight">{formatBRL(value)}</div>
      <div className="text-xs text-text-muted">{hint}</div>
    </div>
  );
}
