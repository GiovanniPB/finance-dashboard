import type { Tables } from "@/lib/supabase";

export type ImportBatch = Tables["import_batches"]["Row"];
export type ImportRow = Tables["import_rows"]["Row"];

/** Required + optional fields the wizard knows how to map. */
export const IMPORTABLE_FIELDS = [
  { key: "accrual_date", label: "Data de competência", required: true },
  { key: "cash_date", label: "Data de caixa", required: false },
  { key: "description", label: "Descrição", required: true },
  { key: "amount", label: "Valor", required: true },
  { key: "direction", label: "Tipo (entrada/saída)", required: true },
  { key: "account_code", label: "Código da conta", required: true },
  { key: "cost_center_code", label: "Centro de custo (código)", required: false },
  { key: "bank_account_nickname", label: "Conta bancária (apelido)", required: false },
  { key: "counterparty_name", label: "Contraparte (nome)", required: false },
  { key: "document_ref", label: "Documento", required: false },
  { key: "status", label: "Status", required: false },
] as const;

export type ImportableFieldKey = (typeof IMPORTABLE_FIELDS)[number]["key"];

export type ColumnMapping = Partial<Record<ImportableFieldKey, string>>;

export type RawCsvRow = Record<string, string>;

export interface ParsedImportRow {
  rowNumber: number;
  raw: RawCsvRow;
  parsed: {
    accrual_date?: string;
    cash_date?: string | null;
    description?: string;
    amount?: number;
    direction?: "inflow" | "outflow";
    account_id?: string;
    cost_center_id?: string | null;
    bank_account_id?: string | null;
    counterparty_id?: string | null;
    document_ref?: string | null;
    status?: "scheduled" | "pending" | "settled" | "reconciled" | "canceled";
  };
  errors: string[];
  isValid: boolean;
}
