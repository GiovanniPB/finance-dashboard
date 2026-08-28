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

import type { NfseEnderecoOverride, PagarmeAddress } from "./types.ts";

/**
 * Valor de `numero` quando não conseguimos extrair um número do endereço. É o
 * que o Focus (NF-e e NFS-e) documenta para endereços sem número — sem isso o
 * schema rejeita (`numero_destinatario não pode ser vazio`). O endereço ainda é
 * marcado como incompleto (`missing` inclui "numero") para sinalizar revisão.
 */
export const NO_STREET_NUMBER = "S/N";

export interface NfseEndereco {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  municipio: string | null;
  uf: string | null;
  codigoMunicipio: string | null; // IBGE (do ViaCEP) — codigo_municipio na NFS-e
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

/** Parte que parece um número de logradouro puro (ex.: "100", "83", "12A"). */
function isStreetNumber(part: string | undefined): boolean {
  return part != null && /^\d+[a-zA-Z]?$/u.test(part);
}

/**
 * Quebra `line_1` em logradouro/numero/bairro por vírgulas (melhor esforço).
 * O pagar.me não tem campo de número dedicado, e os lojistas escrevem `line_1`
 * de dois jeitos comuns — cobrimos ambos detectando ONDE está o número:
 *  - número 1º:  "100, Rua Exemplo, Centro"        -> {numero, logradouro, bairro}
 *  - número 2º:  "Rua Camarão, 144, Apto 703"      -> {logradouro, numero, resto}
 *  - sem número: "D03, Condomínio X, Praia Y"      -> {logradouro, bairro} (numero null)
 * Quando o número está em 2ª posição, o que vier depois costuma ser complemento
 * (não bairro) — tudo bem: o ViaCEP (cep_info) tem precedência sobre o bairro.
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

  // número na 1ª posição: "numero, logradouro, bairro"
  if (isStreetNumber(parts[0])) {
    return { numero: parts[0], logradouro: parts[1] ?? null, bairro: parts[2] ?? null };
  }
  // número na 2ª posição: "logradouro, numero, complemento/bairro"
  if (isStreetNumber(parts[1])) {
    return { logradouro: parts[0], numero: parts[1], bairro: parts[2] ?? null };
  }
  // sem número identificável: logradouro[, bairro]
  return { numero: null, logradouro: parts[0] ?? null, bairro: parts[1] ?? null };
}

/**
 * Campos que o Focus (Barueri/EISS) exige para autorizar a nota.
 *
 * `codigoMunicipio` (IBGE) está aqui porque a prefeitura o rejeita quando ausente
 * ("codigo_municipio: Campo obrigatório") — e ele NÃO é digitável de cabeça, vem
 * do ViaCEP ou da revisão manual. Sem esta linha o job nascia `queued` com o
 * endereço "completo", queimava tentativa e só descobria o furo na rejeição.
 */
const REQUIRED_FIELDS: (keyof NfseEndereco)[] = [
  "logradouro",
  "numero",
  "bairro",
  "cep",
  "municipio",
  "uf",
  "codigoMunicipio",
];

/**
 * Deriva o endereço estruturado do tomador e avalia se está completo p/ emitir.
 * Quando há `cep_info` (enriquecido por ViaCEP no webhook), ele tem precedência
 * sobre o parse de `line_1` para logradouro/bairro/município/UF e fornece o IBGE.
 * O número vem sempre de `line_1` (o ViaCEP não traz número).
 *
 * Acima de ambos vem `nfse_override`: a correção manual do operador na UI. Só os
 * campos preenchidos nela sobrescrevem — o resto segue derivado normalmente.
 */
export function enrichTomadorAddress(address: PagarmeAddress | null | undefined): EnrichedAddress {
  const parsed = parseLine1(address?.line_1 ?? null);
  const cep = address?.cep_info ?? {};
  const fix: NfseEnderecoOverride = address?.nfse_override ?? {};

  // Precedência: correção manual > ViaCEP > parse do line_1 > campos crus.
  // A revisão humana ganha de tudo — é o último recurso quando a derivação falhou.
  const endereco: NfseEndereco = {
    logradouro: clean(fix.logradouro) ?? clean(cep.logradouro) ?? parsed.logradouro,
    numero: clean(fix.numero) ?? parsed.numero,
    complemento: clean(fix.complemento) ?? clean(address?.line_2),
    bairro: clean(fix.bairro) ?? clean(cep.bairro) ?? parsed.bairro,
    cep: digits(fix.cep) ?? digits(address?.zip_code),
    municipio: clean(fix.municipio) ?? clean(cep.municipio) ?? clean(address?.city),
    uf: clean(fix.uf) ?? clean(cep.uf) ?? clean(address?.state),
    codigoMunicipio: clean(fix.codigoMunicipio) ?? clean(cep.ibge),
  };

  const missing = REQUIRED_FIELDS.filter((f) => endereco[f] == null);
  return { endereco, complete: missing.length === 0, missing };
}
