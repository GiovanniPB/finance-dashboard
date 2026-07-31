import { isoDate } from "@/lib/dates";

/**
 * Filtros puros da fila de notas: construção da busca (PostgREST `or`) e atalhos
 * de período. Sem dependência de React ou do cliente Supabase — testável direto.
 */

/** Colunas varridas pela busca livre. */
const SEARCH_FIELDS = [
  "tomador_nome",
  "tomador_documento",
  "numero_nfse",
  "chave_nfse",
  "pagarme_charge_id",
] as const;

const SEARCH_MIN_LENGTH = 2;

/**
 * Monta o filtro `or` do PostgREST para a busca livre. Remove os caracteres que
 * quebram a sintaxe (`,` `(` `)` `.` aspas, curingas) e, quando o termo tem
 * pontuação numérica (CPF/CNPJ, chave), também casa a versão só dígitos — que é
 * como o documento é gravado. Retorna null quando não há termo utilizável.
 */
export function jobSearchOr(term: string | null | undefined): string | null {
  const cleaned = (term ?? "")
    .replace(/[,()."'\\*%]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (cleaned.length < SEARCH_MIN_LENGTH) return null;

  const parts = SEARCH_FIELDS.map((field) => `${field}.ilike.%${cleaned}%`);

  const digits = cleaned.replace(/\D/gu, "");
  if (digits.length >= 3 && digits !== cleaned) {
    parts.push(`tomador_documento.ilike.%${digits}%`, `chave_nfse.ilike.%${digits}%`);
  }

  return parts.join(",");
}

export interface JobPeriodPreset {
  label: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

/** Atalhos de período da fila de notas (dias inclusivos nas duas pontas). */
export function jobPeriodPresets(reference: Date = new Date()): JobPeriodPreset[] {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  const d = reference.getDate();
  const today = isoDate(reference);

  return [
    { label: "Hoje", from: today, to: today },
    { label: "7 dias", from: isoDate(new Date(y, m, d - 6)), to: today },
    { label: "30 dias", from: isoDate(new Date(y, m, d - 29)), to: today },
    { label: "Este mês", from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) },
    {
      label: "Mês passado",
      from: isoDate(new Date(y, m - 1, 1)),
      to: isoDate(new Date(y, m, 0)),
    },
  ];
}
