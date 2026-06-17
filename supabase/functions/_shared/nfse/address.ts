/**
 * Enriquecimento HÍBRIDO do endereço do tomador.
 *
 * O pagar.me entrega o endereço pouco estruturado (geralmente em `line_1`),
 * mas o Focus NFS-e (Barueri) exige `logradouro`, `numero` e `bairro` além de
 * cep/município/uf. Aqui fazemos o melhor esforço de derivar esses campos a
 * partir do que o pagar.me dá; se o resultado ficar incompleto, o job vai para
 * revisão manual (não emite com endereço furado).
 *
 * Convenção observada do pagar.me: `line_1` costuma vir como
 * "<numero>, <logradouro>, <bairro>" (ex.: "100, Rua Exemplo, Centro");
 * `line_2` costuma ser complemento. Tratamos variações de 1–3+ partes.
 *
 * Puro e determinístico — testável por Vitest e usável pelas Edge Functions.
 */

import type { PagarmeAddress } from "./types.ts";

export interface NfseEndereco {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  municipio: string | null;
  uf: string | null;
}

export interface EnrichedAddress {
  endereco: NfseEndereco;
  /** true quando todos os campos exigidos pelo Focus estão presentes. */
  complete: boolean;
  /** campos faltantes (para diagnóstico/UX). */
  missing: string[];
}

function digits(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = value.replace(/\D/gu, "");
  return d.length > 0 ? d : null;
}

function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Quebra `line_1` em logradouro/numero/bairro por vírgulas (melhor esforço):
 *  - 3+ partes: "numero, logradouro, bairro";
 *  - 2 partes:  "numero, logradouro";
 *  - 1 parte:   logradouro (sem número).
 * Se a 1ª parte não parecer um número, assume "logradouro[, bairro]".
 */
function parseLine1(line1: string | null): {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
} {
  const raw = clean(line1);
  if (!raw) return { logradouro: null, numero: null, bairro: null };

  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const firstIsNumber = parts.length > 0 && /^\d+[a-zA-Z]?$/u.test(parts[0]);

  if (firstIsNumber) {
    return {
      numero: parts[0],
      logradouro: parts[1] ?? null,
      bairro: parts[2] ?? null,
    };
  }
  // primeira parte não é número: logradouro[, bairro]
  return {
    numero: null,
    logradouro: parts[0] ?? null,
    bairro: parts[1] ?? null,
  };
}

const REQUIRED_FIELDS: (keyof NfseEndereco)[] = [
  "logradouro",
  "numero",
  "bairro",
  "cep",
  "municipio",
  "uf",
];

/** Deriva o endereço estruturado do tomador e avalia se está completo p/ emitir. */
export function enrichTomadorAddress(address: PagarmeAddress | null | undefined): EnrichedAddress {
  const parsed = parseLine1(address?.line_1 ?? null);

  const endereco: NfseEndereco = {
    logradouro: parsed.logradouro,
    numero: parsed.numero,
    complemento: clean(address?.line_2),
    bairro: parsed.bairro,
    cep: digits(address?.zip_code),
    municipio: clean(address?.city),
    uf: clean(address?.state),
  };

  const missing = REQUIRED_FIELDS.filter((f) => endereco[f] == null);
  return { endereco, complete: missing.length === 0, missing };
}
