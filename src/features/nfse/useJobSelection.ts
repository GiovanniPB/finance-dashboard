import * as React from "react";

import type { InvoiceJob } from "./api";

/**
 * Seleção de notas para emissão em lote. Só `pending_review` é selecionável.
 * A seleção é por id e persiste entre páginas; `headerChecked` reflete o estado
 * do "selecionar todas" da página atual (com estado indeterminado parcial).
 */
export function useJobSelection(jobs: InvoiceJob[]) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const pendingIds = jobs.filter((j) => j.status === "pending_review").map((j) => j.id);
  const selectedOnPage = pendingIds.filter((id) => selected.has(id)).length;
  const headerChecked: boolean | "indeterminate" =
    pendingIds.length > 0 && selectedOnPage === pendingIds.length
      ? true
      : selectedOnPage > 0
        ? "indeterminate"
        : false;

  const toggle = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = React.useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = pendingIds.every((id) => next.has(id));
      for (const id of pendingIds) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [pendingIds]);

  const clear = React.useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, toggleAll, headerChecked, pendingIds, clear };
}
