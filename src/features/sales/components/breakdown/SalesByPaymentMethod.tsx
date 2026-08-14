import { formatNumber } from "@/lib/format";

import type { SalesBreakdownRow } from "../../api";
import { DonutComposition } from "./DonutComposition";
import { paymentMethodLabel, sumAmount } from "./labels";
import { BreakdownCard, TotalAside } from "./shared";

interface Props {
  data: SalesBreakdownRow[] | undefined;
  loading: boolean;
}

/** Meio de pagamento — nominal, poucas categorias: rosca. */
export function SalesByPaymentMethod({ data, loading }: Props) {
  const rows = data ?? [];
  const count = rows.reduce((acc, r) => acc + r.salesCount, 0);

  return (
    <BreakdownCard
      title="Meio de pagamento"
      description="Como o cliente pagou."
      loading={loading}
      isEmpty={rows.length === 0}
      aside={<TotalAside value={sumAmount(rows)} hint={`${formatNumber(count)} venda(s)`} />}
    >
      <DonutComposition rows={rows} labelOf={paymentMethodLabel} />
    </BreakdownCard>
  );
}
