import * as React from "react";

import { DEFAULT_COLUMN_ORDER } from "./columns";

const STORAGE_KEY = "transactions.columns.v1";

export interface ColumnPrefs {
  /** Ordem completa (ids) preferida pelo usuário. */
  order: string[];
  /** Ids ocultos. Usar lista de ocultos faz colunas novas nascerem visíveis. */
  hidden: string[];
}

const DEFAULT_PREFS: ColumnPrefs = {
  order: [...DEFAULT_COLUMN_ORDER],
  hidden: [],
};

function readPrefs(): ColumnPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ColumnPrefs>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order.filter((v) => typeof v === "string") : [],
      hidden: Array.isArray(parsed.hidden)
        ? parsed.hidden.filter((v) => typeof v === "string")
        : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export interface UseColumnPrefsResult {
  prefs: ColumnPrefs;
  isHidden: (id: string) => boolean;
  toggleVisibility: (id: string) => void;
  /** Move a coluna dentro da ordem efetiva (do escopo atual) e persiste. */
  move: (effectiveOrder: string[], id: string, direction: -1 | 1) => void;
  reset: () => void;
}

/**
 * Preferências de colunas da tabela de lançamentos (visibilidade + ordenação),
 * persistidas em localStorage. Preferência pessoal — não vai para a URL.
 */
export function useTransactionColumnPrefs(): UseColumnPrefsResult {
  const [prefs, setPrefs] = React.useState<ColumnPrefs>(readPrefs);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignora falhas de persistência (modo privado, quota excedida, etc.).
    }
  }, [prefs]);

  const isHidden = React.useCallback((id: string) => prefs.hidden.includes(id), [prefs.hidden]);

  const toggleVisibility = React.useCallback((id: string) => {
    setPrefs((prev) => ({
      ...prev,
      hidden: prev.hidden.includes(id) ? prev.hidden.filter((h) => h !== id) : [...prev.hidden, id],
    }));
  }, []);

  const move = React.useCallback((effectiveOrder: string[], id: string, direction: -1 | 1) => {
    const from = effectiveOrder.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= effectiveOrder.length) return;
    const next = [...effectiveOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPrefs((prev) => ({ ...prev, order: next }));
  }, []);

  const reset = React.useCallback(() => {
    setPrefs({ order: [...DEFAULT_COLUMN_ORDER], hidden: [] });
  }, []);

  return { prefs, isHidden, toggleVisibility, move, reset };
}
