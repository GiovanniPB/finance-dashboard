import { formatNumber } from "@/lib/format";

import type { SalesBreakdownRow } from "../../api";
import { sumAmount } from "./labels";
import { RankedBars } from "./RankedBars";
import { BreakdownCard, TotalAside } from "./shared";

interface Props {
  data: SalesBreakdownRow[] | undefined;
  loading: boolean;
}

/**
 * Plano / produto — muitas categorias e rótulo longo: ranking horizontal, com a
 * cauda agrupada em "Outros" para o total do card continuar fechando.
 */
export function SalesByPlan({ data, loading }: Props) {
  const rows = data ?? [];

  return (
    <BreakdownCard
      title="Plano / produto"
      description="Plano do pagar.me; “avulso” é venda sem plano."
      loading={loading}
      isEmpty={rows.length === 0}
      aside={<TotalAside value={sumAmount(rows)} hint={`${formatNumber(rows.length)} plano(s)`} />}
    >
      <RankedBars rows={rows} limit={7} labelWidth={140} />
    </BreakdownCard>
  );
}
