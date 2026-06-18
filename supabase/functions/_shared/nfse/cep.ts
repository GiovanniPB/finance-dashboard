/**
 * Enriquecimento de endereço pelo CEP via ViaCEP.
 *
 * O pagar.me entrega o endereço como texto livre (`line_1`) — sem bairro nem
 * código IBGE do município, ambos necessários (IBGE é obrigatório na NFS-e;
 * bairro/município estruturados ajudam NF-e e NFS-e). O ViaCEP devolve esses
 * campos a partir do CEP.
 *
 * Separação puro/IO:
 *  - `normalizeCep` / `parseViaCepResponse` são PUROS (testados por Vitest);
 *  - `fetchCepInfo` faz o HTTP (usado pelo webhook, Deno).
 */

import type { CepInfo } from "./types.ts";

const VIACEP_BASE = "https://viacep.com.br/ws";

/** Mantém só dígitos e valida 8 posições; senão null. */
export function normalizeCep(cep: string | null | undefined): string | null {
  if (!cep) return null;
  const digits = cep.replace(/\D/gu, "");
  return digits.length === 8 ? digits : null;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Converte a resposta JSON do ViaCEP em `CepInfo`. Resposta `{ erro: true }`
 * (CEP inexistente) -> null. Função pura (não faz rede).
 */
export function parseViaCepResponse(json: unknown): CepInfo | null {
  if (!json || typeof json !== "object") return null;
  const d = json as Record<string, unknown>;
  if (d.erro === true || d.erro === "true") return null;

  const info: CepInfo = {
    logradouro: clean(d.logradouro),
    bairro: clean(d.bairro),
    municipio: clean(d.localidade),
    uf: clean(d.uf),
    ibge: clean(d.ibge),
  };
  // se nada de útil veio, trata como ausência
  const hasAny = Object.values(info).some((v) => v != null);
  return hasAny ? info : null;
}

/** Consulta o ViaCEP (HTTP). Retorna null em CEP inválido/erro de rede. */
export async function fetchCepInfo(cep: string | null | undefined): Promise<CepInfo | null> {
  const normalized = normalizeCep(cep);
  if (!normalized) return null;
  try {
    const res = await fetch(`${VIACEP_BASE}/${normalized}/json/`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return parseViaCepResponse(await res.json());
  } catch {
    return null;
  }
}
