import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMonthYear } from "@/lib/dates";
import { formatBRL, formatNumber } from "@/lib/format";

import type { ReceivablesMonth } from "../api";

interface Props {
  data: ReceivablesMonth[] | undefined;
  loading: boolean;
}

/**
 * A curva que não existia no sistema: quanto entra do pagar.me, em que mês.
 * Separa o que já liquidou do que ainda está contratado — a barra pendente é o
 * "a receber" que antes ficava invisível até a TED cair.
 */
export function ReceivablesScheduleChart({ data, loading }: Props) {
  const pending = (data ?? []).reduce((acc, m) => acc + m.pendingGross, 0);
  // `pendingInstallments`, não `installmentsCount`: o total do mês inclui parcelas
  // já liquidadas e inflaria a contagem de "a receber".
  const installments = (data ?? []).reduce((acc, m) => acc + m.pendingInstallments, 0);
  const fees = (data ?? []).reduce((acc, m) => acc + m.fees, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Cronograma de recebíveis</CardTitle>
            <CardDescription>
              Liquidação por mês, com a fatia já creditada e a ainda contratada.
            </CardDescription>
          </div>
          {!loading && pending > 0 ? (
            <div className="text-right">
              <div className="text-2xs font-medium tracking-wide text-text-subtle uppercase">
                A receber
              </div>
              <div className="font-display text-xl font-semibold tracking-tight text-accent">
                {formatBRL(pending)}
              </div>
              <div className="text-xs text-text-muted">
                {formatNumber(installments)} parcelas · taxas {formatBRL(fees)}
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : !data || data.length === 0 ? (
          <div className="grid h-[280px] place-items-center rounded-[var(--radius-lg)] border border-dashed border-border text-sm text-text-muted">
            Nenhum recebível na janela. Rode o backfill para materializar o histórico.
          </div>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.map((m) => ({
                  label: formatMonthYear(m.monthStart).split(" ")[0],
                  liquidado: m.settledGross,
                  pendente: m.pendingGross,
                }))}
              >
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                  stroke="var(--color-border)"
                />
                <YAxis
                  tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                  stroke="var(--color-border)"
                  tickFormatter={(v: number) => formatBRL(v, { compact: true })}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => formatBRL(v)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="liquidado"
                  name="Já liquidado"
                  stackId="r"
                  fill="var(--color-income)"
                />
                <Bar
                  dataKey="pendente"
                  name="A receber"
                  stackId="r"
                  fill="var(--color-accent)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
