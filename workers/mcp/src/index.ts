/**
 * Servidor MCP do grupo OTM — Cloudflare Worker.
 *
 * Casca fina: toda a semântica está em `supabase/functions/_shared/mcp/`, o mesmo
 * código que o transporte stdio usa. Aqui só se resolve o que é do ambiente —
 * verificar o token por JWKS e criar um client do Supabase que age COMO O USUÁRIO.
 *
 * Duas propriedades que valem mais que o código:
 *
 * - **O Worker não tem segredo.** URL e anon key são públicas; a verificação usa
 *   chave pública. Não há service role em lugar nenhum deste caminho.
 * - **Nada aqui decide permissão.** Quem decide é a RLS, com o token do usuário.
 *   Se este arquivo tiver um bug, o pior caso é erro, não vazamento.
 *
 * Por que Worker e não Edge Function: o cliente MCP descobre onde se autenticar
 * lendo `/.well-known/oauth-protected-resource` na RAIZ do host — que numa Edge
 * Function não é nossa. Ver §4.5 do plano.
 */
import { createClient } from "@supabase/supabase-js";

import { supabaseDataSource } from "../../../supabase/functions/_shared/mcp/datasource.ts";
import {
  criarHandlerMcp,
  type RegistroDeUso,
} from "../../../supabase/functions/_shared/mcp/http.ts";
import { criarVerificadorDeToken } from "./auth.ts";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** URL pública deste Worker, como o cliente MCP a enxerga. */
  MCP_RESOURCE_URL: string;
}

/** Client que fala com o PostgREST carregando o token do usuário. */
function clientDoUsuario(env: Env, token: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * O handler é montado uma vez por isolate e reaproveitado: o `createRemoteJWKSet`
 * guarda o conjunto de chaves em memória, evitando um fetch por requisição.
 */
let handlerCache: ((req: Request) => Promise<Response>) | null = null;

function obterHandler(env: Env): (req: Request) => Promise<Response> {
  if (handlerCache) return handlerCache;

  const issuer = `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;

  handlerCache = criarHandlerMcp({
    resourceUrl: env.MCP_RESOURCE_URL.replace(/\/$/, ""),
    authorizationServer: issuer,
    verificarToken: criarVerificadorDeToken(issuer),
    criarDataSource: (token) => supabaseDataSource(clientDoUsuario(env, token)),

    // Lista do que a CASA autoriza, além do que o usuário aprova. Com registro
    // dinâmico ligado, qualquer cliente MCP consegue se registrar no nosso
    // authorization server; esta checagem é o que impede um desconhecido de ser
    // atendido só porque conseguiu um consentimento.
    autorizarCliente: async (claims, token) => {
      const clientId = claims.client_id;
      if (!clientId) return "Token sem client_id: este endpoint só atende conectores OAuth.";

      const { data, error } = await clientDoUsuario(env, token)
        .from("mcp_clients")
        .select("nome, ativo")
        .eq("client_id", clientId)
        .maybeSingle();

      if (error) return "Não foi possível verificar o conector no momento.";
      if (!data) return `Conector ${clientId} não está autorizado neste servidor.`;
      if (!data.ativo) return `Conector "${data.nome}" está desativado.`;
      return null;
    },
    registrarUso: async (registro: RegistroDeUso, token: string) => {
      // Grava como o usuário: a RLS de mcp_query_log exige user_id = auth.uid().
      const { error } = await clientDoUsuario(env, token).from("mcp_query_log").insert({
        user_id: registro.userId,
        client_id: registro.clientId,
        tool: registro.tool,
        params: registro.params,
        row_count: registro.rowCount,
        duration_ms: registro.durationMs,
        error: registro.error,
      });
      if (error) console.error("mcp_query_log:", error.message);
    },
  });

  return handlerCache;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.MCP_RESOURCE_URL) {
      return new Response(
        JSON.stringify({ error: "Worker mal configurado: faltam variáveis de ambiente." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    return obterHandler(env)(request);
  },
};
