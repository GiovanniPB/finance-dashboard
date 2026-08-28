/**
 * Derivação do endereço do tomador para a UI de revisão (/nfse).
 *
 * FONTE DA VERDADE: `supabase/functions/_shared/nfse/address.ts`
 * (`enrichTomadorAddress`). Este arquivo é um ESPELHO: as Edge Functions rodam em
 * Deno e o app não importa de `supabase/functions/`, então a mesma precedência é
 * reproduzida aqui para que a tela mostre exatamente o que o worker vai emitir.
 * Mudou lá? Mude aqui (os testes dos dois lados cobrem os mesmos casos).
 *
 * Por que a UI precisa disso: o pagar.me manda o endereço em texto livre, e o
 * que o Focus exige (logradouro/numero/bairro/cep/municipio/uf + IBGE) só existe
 * depois de derivado. Sem reproduzir a derivação, o operador não teria como saber
 * QUAL campo está faltando nem com que valor o formulário deve começar.
 */

export interface TomadorEndereco {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  municipio: string | null;
  uf: string | null;
  codigoMunicipio: string | null; // IBGE — `codigo_municipio` na NFS-e
}

/** Correção manual gravada em `tomador_endereco.nfse_override`. */
export type TomadorEnderecoOverride = Partial<Record<keyof TomadorEndereco, string | null>>;

export interface DerivedTomadorEndereco {
  endereco: TomadorEndereco;
  complete: boolean;
  missing: (keyof TomadorEndereco)[];
}

/** Campos exigidos pelo Focus (Barueri). Mesma lista do `_shared/nfse/address.ts`. */
export const REQUIRED_ENDERECO_FIELDS: (keyof TomadorEndereco)[] = [
  "logradouro",
  "numero",
  "bairro",
  "cep",
  "municipio",
  "uf",
  "codigoMunicipio",
];

export const ENDERECO_FIELD_LABELS: Record<keyof TomadorEndereco, string> = {
  logradouro: "Logradouro",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cep: "CEP",
  municipio: "Município",
  uf: "UF",
  codigoMunicipio: "Código IBGE",
};

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function digits(value: unknown): string | null {
  const t = clean(value);
  if (!t) return null;
  const d = t.replace(/\D/gu, "");
  return d.length > 0 ? d : null;
}

function isStreetNumber(part: string | undefined): boolean {
  return part != null && /^\d+[a-zA-Z]?$/u.test(part);
}

/** Quebra `line_1` em logradouro/numero/bairro (espelho de `parseLine1`). */
function parseLine1(line1: unknown): {
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

  if (isStreetNumber(parts[0])) {
    return { numero: parts[0], logradouro: parts[1] ?? null, bairro: parts[2] ?? null };
  }
  if (isStreetNumber(parts[1])) {
    return { logradouro: parts[0], numero: parts[1], bairro: parts[2] ?? null };
  }
  return { numero: null, logradouro: parts[0] ?? null, bairro: parts[1] ?? null };
}

/**
 * Deriva o endereço estruturado a partir do jsonb `invoice_jobs.tomador_endereco`.
 * Precedência: correção manual > ViaCEP (`cep_info`) > parse de `line_1` > cru.
 */
export function deriveTomadorEndereco(raw: unknown): DerivedTomadorEndereco {
  const address = (raw ?? {}) as Record<string, unknown>;
  const cep = (address.cep_info ?? {}) as Record<string, unknown>;
  const fix = (address.nfse_override ?? {}) as Record<string, unknown>;
  const parsed = parseLine1(address.line_1);

  const endereco: TomadorEndereco = {
    logradouro: clean(fix.logradouro) ?? clean(cep.logradouro) ?? parsed.logradouro,
    numero: clean(fix.numero) ?? parsed.numero,
    complemento: clean(fix.complemento) ?? clean(address.line_2),
    bairro: clean(fix.bairro) ?? clean(cep.bairro) ?? parsed.bairro,
    cep: digits(fix.cep) ?? digits(address.zip_code),
    municipio: clean(fix.municipio) ?? clean(cep.municipio) ?? clean(address.city),
    uf: clean(fix.uf) ?? clean(cep.uf) ?? clean(address.state),
    codigoMunicipio: clean(fix.codigoMunicipio) ?? clean(cep.ibge),
  };

  const missing = REQUIRED_ENDERECO_FIELDS.filter((f) => endereco[f] == null);
  return { endereco, complete: missing.length === 0, missing };
}

/** true quando o job já passou por revisão manual do endereço. */
export function hasEnderecoOverride(raw: unknown): boolean {
  const address = (raw ?? {}) as Record<string, unknown>;
  const fix = address.nfse_override;
  return fix != null && typeof fix === "object" && Object.keys(fix).length > 0;
}

/**
 * Monta o novo `tomador_endereco` preservando o payload original do pagar.me e
 * gravando a correção em `nfse_override`. Campos vazios são omitidos — o que o
 * operador não preencher continua sendo derivado.
 */
export function buildEnderecoOverride(
  raw: unknown,
  values: Record<keyof TomadorEndereco, string>,
): Record<string, unknown> {
  const address = { ...((raw ?? {}) as Record<string, unknown>) };

  const override: TomadorEnderecoOverride = {};
  for (const field of Object.keys(ENDERECO_FIELD_LABELS) as (keyof TomadorEndereco)[]) {
    const value = field === "cep" ? digits(values[field]) : clean(values[field]);
    if (value != null) override[field] = value;
  }

  address.nfse_override = override;
  return address;
}

/** Campos do endereço em que a revisão mudou o valor derivado (para o rastro). */
export function changedEnderecoFields(
  raw: unknown,
  values: Record<keyof TomadorEndereco, string>,
): string[] {
  const { endereco } = deriveTomadorEndereco(raw);
  return (Object.keys(ENDERECO_FIELD_LABELS) as (keyof TomadorEndereco)[]).filter((field) => {
    const next = field === "cep" ? digits(values[field]) : clean(values[field]);
    return next !== endereco[field];
  });
}
