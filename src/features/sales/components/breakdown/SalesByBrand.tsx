import { formatNumber } from "@/lib/format";

import type { SalesBreakdownRow } from "../../api";
import { DonutComposition } from "./DonutComposition";
import { brandLabel, sumAmount } from "./labels";
import { BreakdownCard, TotalAside } from "./shared";

interface Props {
  data: SalesBreakdownRow[] | undefined;
  loading: boolean;
}

/** Bandeira — nominal, poucas categorias: rosca, igual ao meio de pagamento. */
export function SalesByBrand({ data, loading }: Props) {
  const rows = data ?? [];
  const count = rows.reduce((acc, r) => acc + r.salesCount, 0);

  return (
    <BreakdownCard
      title="Bandeira"
      description="Bandeira do cartão; “não-cartão” cobre Pix e boleto."
      loading={loading}
      isEmpty={rows.length === 0}
      aside={<TotalAside value={sumAmount(rows)} hint={`${formatNumber(count)} venda(s)`} />}
    >
      <DonutComposition rows={rows} labelOf={brandLabel} />
    </BreakdownCard>
  );
}
