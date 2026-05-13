import Papa from "papaparse";

import type { ColumnMapping, ImportableFieldKey, ParsedImportRow, RawCsvRow } from "./types";

export interface ParseResult {
  columns: string[];
  rows: RawCsvRow[];
  errors: string[];
}

/** Parses a CSV file (with header) into raw rows + detected column names. */
export async function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const errors = result.errors.map((e) => `Linha ${e.row ?? "?"}: ${e.message}`);
        resolve({
          columns: result.meta.fields ?? [],
          rows: result.data,
          errors,
        });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

/** Heuristic: pre-fill mapping based on column header names. */
export function suggestMapping(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/gu, "")
      .replace(/[^a-z0-9]/gu, "");

  const patterns: Record<ImportableFieldKey, string[]> = {
    accrual_date: ["datacompetencia", "competencia", "data", "date", "datalancamento"],
    cash_date: ["datacaixa", "datapagamento", "datadebito", "datacredito", "cashdate"],
    description: ["descricao", "description", "historico", "memo", "memo"],
    amount: ["valor", "amount", "value", "total"],
    direction: ["tipo", "direction", "natureza", "operacao"],
    account_code: ["conta", "account", "contacontabil", "accountcode", "codigoconta"],
    cost_center_code: ["centrocusto", "centrodecusto", "costcenter", "cc"],
    bank_account_nickname: ["banco", "bank", "conta", "bankaccount"],
    counterparty_name: [
      "contraparte",
      "fornecedor",
      "cliente",
      "supplier",
      "customer",
      "favorecido",
    ],
    document_ref: ["documento", "doc", "nf", "boleto", "ref"],
    status: ["status", "situacao"],
  };

  for (const col of columns) {
    const n = normalize(col);
    for (const [field, candidates] of Object.entries(patterns) as [
      ImportableFieldKey,
      string[],
    ][]) {
      if (mapping[field]) continue;
      if (candidates.some((c) => n.includes(c))) {
        mapping[field] = col;
        break;
      }
    }
  }

  return mapping;
}

/**
 * Parses a single raw row into a normalized transaction shape.
 * Resolves account_code / cost_center_code / bank_nickname / counterparty_name into ids
 * using the provided lookup maps.
 */
export interface LookupMaps {
  accountsByCode: Map<string, string>;
  costCentersByCode: Map<string, string>;
  bankAccountsByNickname: Map<string, string>;
  counterpartiesByName: Map<string, string>;
}

export function parseRow(
  rowNumber: number,
  raw: RawCsvRow,
  mapping: ColumnMapping,
  lookups: LookupMaps,
): ParsedImportRow {
  const errors: string[] = [];
  const out: ParsedImportRow["parsed"] = {};

  const get = (k: ImportableFieldKey): string | undefined => {
    const col = mapping[k];
    if (!col) return undefined;
    const v = raw[col];
    return v == null ? undefined : v.trim();
  };

  // Required fields
  const accrual = get("accrual_date");
  if (!accrual) errors.push("Data de competência ausente");
  else {
    const iso = parseDate(accrual);
    if (!iso) errors.push(`Data de competência inválida: "${accrual}"`);
    else out.accrual_date = iso;
  }

  const cash = get("cash_date");
  if (cash) {
    const iso = parseDate(cash);
    if (!iso) errors.push(`Data de caixa inválida: "${cash}"`);
    else out.cash_date = iso;
  } else {
    out.cash_date = null;
  }

  const description = get("description");
  if (!description) errors.push("Descrição ausente");
  else out.description = description;

  const amountRaw = get("amount");
  if (!amountRaw) errors.push("Valor ausente");
  else {
    const n = parseAmount(amountRaw);
    if (n == null || !Number.isFinite(n) || n <= 0) errors.push(`Valor inválido: "${amountRaw}"`);
    else out.amount = n;
  }

  const directionRaw = get("direction");
  if (!directionRaw) errors.push("Tipo (entrada/saída) ausente");
  else {
    const dir = parseDirection(directionRaw);
    if (!dir) errors.push(`Tipo inválido: "${directionRaw}" (use entrada/saida ou inflow/outflow)`);
    else out.direction = dir;
  }

  const accountCode = get("account_code");
  if (!accountCode) errors.push("Conta ausente");
  else {
    const accountId = lookups.accountsByCode.get(accountCode);
    if (!accountId) errors.push(`Conta não encontrada: "${accountCode}"`);
    else out.account_id = accountId;
  }

  // Optional fields
  const ccCode = get("cost_center_code");
  if (ccCode) {
    const ccId = lookups.costCentersByCode.get(ccCode);
    if (!ccId) errors.push(`Centro de custo não encontrado: "${ccCode}"`);
    else out.cost_center_id = ccId;
  } else {
    out.cost_center_id = null;
  }

  const bankNick = get("bank_account_nickname");
  if (bankNick) {
    const bankId = lookups.bankAccountsByNickname.get(bankNick);
    if (!bankId) errors.push(`Conta bancária não encontrada: "${bankNick}"`);
    else out.bank_account_id = bankId;
  } else {
    out.bank_account_id = null;
  }

  const cpName = get("counterparty_name");
  if (cpName) {
    const cpId = lookups.counterpartiesByName.get(cpName.toLowerCase());
    if (cpId) out.counterparty_id = cpId;
    // If not found, just leave null (não bloqueia o import)
  } else {
    out.counterparty_id = null;
  }

  const docRef = get("document_ref");
  out.document_ref = docRef ?? null;

  const statusRaw = get("status");
  if (statusRaw) {
    const status = parseStatus(statusRaw);
    if (status) out.status = status;
  }

  return {
    rowNumber,
    raw,
    parsed: out,
    errors,
    isValid: errors.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────

/** Accepts: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY. Returns ISO YYYY-MM-DD or null. */
export function parseDate(input: string): string | null {
  const trimmed = input.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) return trimmed;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u.exec(trimmed);
  if (m) {
    const [, d, mo, y] = m;
    if (!d || !mo || !y) return null;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Accepts: "1234.56", "1.234,56", "R$ 1.234,56", "1234". */
export function parseAmount(input: string): number | null {
  const cleaned = input
    .replace(/r\$|brl/giu, "")
    .replace(/\s/gu, "")
    .trim();
  if (cleaned === "") return null;
  // Heurística: se tem vírgula como decimal (formato pt-BR) — remove pontos de milhar e troca vírgula por ponto
  if (/,\d{1,2}$/u.test(cleaned)) {
    const normalized = cleaned.replace(/\./gu, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? Math.abs(n) : null;
  }
  // formato US/numérico puro
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

export function parseDirection(input: string): "inflow" | "outflow" | null {
  const v = input.toLowerCase().trim();
  if (["inflow", "entrada", "credito", "crédito", "receita", "in", "+", "c"].includes(v))
    return "inflow";
  if (["outflow", "saida", "saída", "debito", "débito", "despesa", "out", "-", "d"].includes(v))
    return "outflow";
  return null;
}

export function parseStatus(
  input: string,
): "scheduled" | "pending" | "settled" | "reconciled" | "canceled" | null {
  const v = input.toLowerCase().trim();
  const map: Record<string, ReturnType<typeof parseStatus>> = {
    agendado: "scheduled",
    scheduled: "scheduled",
    pendente: "pending",
    pending: "pending",
    liquidado: "settled",
    pago: "settled",
    settled: "settled",
    conciliado: "reconciled",
    reconciled: "reconciled",
    cancelado: "canceled",
    canceled: "canceled",
  };
  return map[v] ?? null;
}
