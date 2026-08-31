/**
 * Verificação do access token por JWKS.
 *
 * O Supabase assina em ES256 e publica a chave pública em
 * `<issuer>/.well-known/jwks.json` — local e hospedado, do mesmo jeito. O Worker só
 * precisa da chave PÚBLICA: não guarda segredo nenhum, e por isso não há segredo
 * para vazar daqui.
 *
 * Exigimos `client_id`. Um token de sessão comum do aplicativo (sem essa claim)
 * é recusado, ainda que válido: este endpoint está exposto na internet, e só deve
 * aceitar token nascido do fluxo de consentimento. É também o mesmo predicado que a
 * RLS usa para recusar escrita — quem chega aqui não escreve, por construção.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

import type { TokenClaims } from "../../../supabase/functions/_shared/mcp/http.ts";

export function criarVerificadorDeToken(
  issuer: string,
): (token: string) => Promise<TokenClaims | null> {
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return async function verificar(token: string): Promise<TokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: "authenticated",
      });
      if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
      if (typeof payload.client_id !== "string" || payload.client_id.length === 0) return null;
      return payload as unknown as TokenClaims;
    } catch {
      // Assinatura inválida, expirado, issuer errado: tudo vira "não autorizado".
      // O detalhe fica fora da resposta de propósito.
      return null;
    }
  };
}
