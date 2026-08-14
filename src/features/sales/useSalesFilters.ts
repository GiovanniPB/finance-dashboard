import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

const GRAINS = ["day", "week", "month"] as const;

/**
 * Estado compartilhável do dashboard de vendas na URL (convenção do projeto:
 * filtro e aba vão na URL, não em estado local, para o link ser reproduzível).
 *
 * `account` = "all" significa todas as conexões que o usuário pode ver (a RLS
 * recorta). Sentinela em vez de string vazia porque o Radix Select reserva "" para
 * limpar a seleção e lança se um item usar esse valor.
 */
export function useSalesFilters() {
  return useQueryStates({
    year: parseAsInteger.withDefault(new Date().getFullYear()),
    // 0 = ano inteiro; 1-12 = mês específico
    month: parseAsInteger.withDefault(0),
    grain: parseAsStringLiteral(GRAINS).withDefault("day"),
    account: parseAsString.withDefault("all"),
  });
}
