/**
 * Validação de parâmetros das tools.
 *
 * Regra do projeto: **nenhum parâmetro implícito**. Sem empresa e sem período, a
 * tool não responde — ela pergunta. Metade dos erros de análise por IA nasce de um
 * default silencioso ("assumi o mês corrente", "assumi a holding").
 *
 * As mensagens de erro são escritas para o MODELO ler e se corrigir sozinho: dizem
 * o que faltou e qual tool chamar para descobrir o valor certo.
 */
import type { CampoData, Regime } from "./types.ts";

export class McpParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpParamError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Janela máxima de uma consulta. Protege orçamento de token e o banco. */
export const MAX_PERIODO_DIAS = 1096; // ~3 anos

export function asObject(params: unknown): Record<string, unknown> {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new McpParamError("Os parâmetros devem ser um objeto JSON.");
  }
  return params as Record<string, unknown>;
}

export function requireUuid(params: Record<string, unknown>, key: string, dica: string): string {
  const value = params[key];
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new McpParamError(`Parâmetro "${key}" é obrigatório e deve ser um UUID. ${dica}`);
  }
  return value;
}

export function optionalUuid(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new McpParamError(`Parâmetro "${key}", quando informado, deve ser um UUID.`);
  }
  return value;
}

export function requireDate(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new McpParamError(`Parâmetro "${key}" é obrigatório no formato AAAA-MM-DD.`);
  }
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new McpParamError(`Parâmetro "${key}" não é uma data válida: ${value}.`);
  }
  return value;
}

export interface Periodo {
  from: string;
  to: string;
  /** Rótulo pronto para a proveniência: "01/07/2026 a 31/07/2026". */
  rotulo: string;
}

/** Exige `from` e `to`, valida a ordem e o tamanho da janela. */
export function requirePeriodo(params: Record<string, unknown>): Periodo {
  const from = requireDate(params, "from");
  const to = requireDate(params, "to");
  if (from > to) {
    throw new McpParamError(`Período inválido: "from" (${from}) é posterior a "to" (${to}).`);
  }
  const dias = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
  if (dias > MAX_PERIODO_DIAS) {
    throw new McpParamError(
      `Período de ${dias} dias excede o máximo de ${MAX_PERIODO_DIAS}. Consulte em partes.`,
    );
  }
  return { from, to, rotulo: `${brDate(from)} a ${brDate(to)}` };
}

/** AAAA-MM-DD -> DD/MM/AAAA (sem Date, sem fuso: é rótulo, não cálculo). */
export function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function requireEnum<T extends string>(
  params: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = params[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new McpParamError(
      `Parâmetro "${key}" é obrigatório e deve ser um de: ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}

export function optionalEnum<T extends string>(
  params: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = params[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new McpParamError(
      `Parâmetro "${key}", quando informado, deve ser um de: ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}

export function optionalBoolean(
  params: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = params[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new McpParamError(`Parâmetro "${key}", quando informado, deve ser true ou false.`);
  }
  return value;
}

export function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new McpParamError(`Parâmetro "${key}", quando informado, deve ser um texto não vazio.`);
  }
  return value.trim();
}

/** Limite com teto rígido: o modelo pode pedir menos, nunca mais. */
export function optionalLimit(
  params: Record<string, unknown>,
  key: string,
  fallback: number,
  max: number,
): number {
  const value = params[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new McpParamError(`Parâmetro "${key}", quando informado, deve ser um inteiro >= 1.`);
  }
  return Math.min(value, max);
}

export const REGIMES: readonly Regime[] = ["competencia", "caixa"] as const;
export const CAMPOS_DATA: readonly CampoData[] = ["competencia", "caixa"] as const;

/** Exige exatamente um entre company_id e organization_id. */
export function requireEscopo(params: Record<string, unknown>): {
  companyId?: string;
  organizationId?: string;
} {
  const companyId = optionalUuid(params, "company_id");
  const organizationId = optionalUuid(params, "organization_id");
  if (!companyId && !organizationId) {
    throw new McpParamError(
      'Informe "company_id" (uma empresa) ou "organization_id" (o grupo consolidado). ' +
        'Use a tool "list_companies" para descobrir os IDs.',
    );
  }
  if (companyId && organizationId) {
    throw new McpParamError('Informe "company_id" OU "organization_id", nunca os dois.');
  }
  return { companyId, organizationId };
}
