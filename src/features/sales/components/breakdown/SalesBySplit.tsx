import { Badge } from "@/components/ui/badge";

import type { SalesBreakdownRow } from "../../api";
import { sumAmount } from "./labels";
import { RankedBars } from "./RankedBars";
import { BreakdownCard, TotalAside } from "./shared";

interface Props {
  data: SalesBreakdownRow[] | undefined;
  loading: boolean;
}

/**
 * Split por empresa — a ÚNICA dimensão que sai dos recebíveis, e não das vendas.
 *
 * É dinheiro (quem recebe), não venda (quem vendeu): no grupo isso importa,
 * porque a RCO recebe dentro da conta da Jimmy. Por isso o selo no cabeçalho —
 * comparar este total com o das outras composições seria comparar coisas
 * diferentes.
 */
export function SalesBySplit({ data, loading }: Props) {
  const rows = data ?? [];

  return (
    <BreakdownCard
      title="Empresa (split)"
      description="Quanto cada empresa do grupo recebe — sai dos recebíveis, não da venda."
      loading={loading}
      isEmpty={rows.length === 0}
      emptyLabel="Nenhum recebível com split no período."
      aside={
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone="accent">recebíveis</Badge>
          <TotalAside value={sumAmount(rows)} hint="bruto do split" />
        </div>
      }
    >
      <RankedBars rows={rows} limit={6} labelWidth={150} />
    </BreakdownCard>
  );
}
