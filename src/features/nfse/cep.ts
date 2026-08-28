/**
 * Consulta de CEP (ViaCEP) para a revisão manual do tomador na UI.
 *
 * FONTE DA VERDADE do enriquecimento automático: `supabase/functions/_shared/nfse/cep.ts`
 * (roda no webhook, em Deno). Aqui é o mesmo serviço consultado sob demanda pelo
 * operador — porque o caso que chega à revisão é justamente aquele em que o
 * webhook NÃO conseguiu resolver o CEP, e o código IBGE não é digitável de cabeça.
 *
 * Diferença de contrato proposital: lá o retorno é `CepInfo | null` (o webhook só
 * quer saber se deu para enriquecer); aqui o resultado é discriminado, para a tela
 * poder dizer "CEP não encontrado" e "falha de conexão" com palavras diferentes.
 */

const VIACEP_BASE = "https://viacep.com.br/ws";

export interface CepLookupData {
  logradouro: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  ibge: string | null;
}

export type CepLookupResult =
  | { status: "ok"; data: CepLookupData }
  | { status: "invalid" } // não tem 8 dígitos
  | { status: "not_found" } // ViaCEP respondeu { erro: true }
  | { status: "error"; message: string }; // rede/HTTP

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

/** Converte a resposta do ViaCEP. `{ erro: true }` (CEP inexistente) -> null. Pura. */
export function parseViaCepResponse(json: unknown): CepLookupData | null {
  if (!json || typeof json !== "object") return null;
  const d = json as Record<string, unknown>;
  if (d.erro === true || d.erro === "true") return null;

  const data: CepLookupData = {
    logradouro: clean(d.logradouro),
    bairro: clean(d.bairro),
    municipio: clean(d.localidade),
    uf: clean(d.uf),
    ibge: clean(d.ibge),
  };
  return Object.values(data).some((v) => v != null) ? data : null;
}

/** Consulta o ViaCEP. Nunca lança — o erro vira estado para a tela mostrar. */
export async function lookupCep(cep: string): Promise<CepLookupResult> {
  const normalized = normalizeCep(cep);
  if (!normalized) return { status: "invalid" };

  try {
    const res = await fetch(`${VIACEP_BASE}/${normalized}/json/`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { status: "error", message: `ViaCEP respondeu ${res.status}` };

    const data = parseViaCepResponse(await res.json());
    return data ? { status: "ok", data } : { status: "not_found" };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Falha na consulta" };
  }
}
