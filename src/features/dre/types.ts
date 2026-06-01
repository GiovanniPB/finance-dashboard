import type { Enums } from "@/lib/supabase";

export interface DreRow {
  account_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  kind: Enums["account_kind"];
  dre_section: Enums["dre_section"] | null;
  is_summary: boolean;
  below_the_line: boolean;
  sign_hint: "+" | "-" | "+/-" | "=" | null;
  sort_order: number;
  /** Total on accrual basis (regime de competência), by accrual_date. */
  total: number;
  /** Total on cash basis (regime de caixa), by cash_date. */
  total_cash: number;
}

export interface DreComputedRow extends DreRow {
  /** Computed display total on accrual basis (children sum or running balance). */
  effective_total: number;
  /** Computed display total on cash basis. */
  effective_total_cash: number;
  /** Depth in the chart of accounts (0-based) — used for indentation. */
  depth: number;
}

export interface DrePeriod {
  from: string;
  to: string;
  label: string;
}
