import * as React from "react";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import type { InvoiceJobDateField } from "./api";
import {
  AMBIENTE_FILTER_VALUES,
  DATE_FIELD_VALUES,
  JOB_STATUS_FILTER_VALUES,
  ORIGIN_FILTER_VALUES,
  type AmbienteFilter,
  type JobStatusFilter,
  type OriginFilter,
} from "./constants";

export interface InvoiceJobFilterState {
  status: JobStatusFilter;
  ambiente: AmbienteFilter;
  origin: OriginFilter;
  accountId: string; // 'all' | uuid da conexão
  dateField: InvoiceJobDateField;
  from: string; // YYYY-MM-DD ('' = sem limite)
  to: string;
  search: string;
  page: number; // 0-based
}

/** Valores neutros: o que não aparece na URL. */
export const JOB_FILTER_DEFAULTS: InvoiceJobFilterState = {
  status: "review",
  ambiente: "all",
  origin: "all",
  accountId: "all",
  dateField: "paid_at",
  from: "",
  to: "",
  search: "",
  page: 0,
};

const PARSERS = {
  status: parseAsStringLiteral(JOB_STATUS_FILTER_VALUES).withDefault(JOB_FILTER_DEFAULTS.status),
  ambiente: parseAsStringLiteral(AMBIENTE_FILTER_VALUES).withDefault(JOB_FILTER_DEFAULTS.ambiente),
  origin: parseAsStringLiteral(ORIGIN_FILTER_VALUES).withDefault(JOB_FILTER_DEFAULTS.origin),
  accountId: parseAsString.withDefault(JOB_FILTER_DEFAULTS.accountId),
  dateField: parseAsStringLiteral(DATE_FIELD_VALUES).withDefault(JOB_FILTER_DEFAULTS.dateField),
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
  search: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(0),
};

/** Quantos filtros estão fora do padrão (para o rótulo do "Limpar"). */
export function countActiveJobFilters(state: InvoiceJobFilterState): number {
  const keys = ["status", "ambiente", "origin", "accountId", "search"] as const;
  const changed = keys.filter((k) => state[k] !== JOB_FILTER_DEFAULTS[k]).length;
  // o período conta como um filtro só, mesmo com as duas pontas preenchidas
  return changed + (state.from || state.to ? 1 : 0);
}

/**
 * Filtros da fila de notas na URL (compartilháveis). Qualquer mudança de filtro
 * volta para a primeira página; a paginação tem um setter próprio.
 */
export function useInvoiceJobFilters() {
  const [filters, set] = useQueryStates(PARSERS);

  const setFilters = React.useCallback(
    (patch: Partial<InvoiceJobFilterState>) => void set({ page: 0, ...patch }),
    [set],
  );

  const setPage = React.useCallback((page: number) => void set({ page }), [set]);

  // limpa os filtros mas preserva o campo de data (é o modo de leitura da lista)
  const reset = React.useCallback(() => {
    void set({
      status: null,
      ambiente: null,
      origin: null,
      accountId: null,
      from: null,
      to: null,
      search: null,
      page: null,
    });
  }, [set]);

  return { filters, setFilters, setPage, reset };
}
