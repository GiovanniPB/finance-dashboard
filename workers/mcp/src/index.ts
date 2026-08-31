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

import { decidirSobreConector } from "../../../supabase/functions/_shared/mcp/clientes.ts";
import { supabaseDataSource } from "../../../supabase/functions/_shared/mcp/datasource.ts";
import {
  criarHandlerMcp,
  type RegistroDeUso,
} from "../../../supabase/functions/_shared/mcp/http.ts";
import { criarVerificadorDeToken } from "./auth.ts";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /**
   * URL pública deste Worker. OPCIONAL: se ausente, usamos a origem da própria
   * requisição, que é literalmente o endereço pelo qual o cliente chegou.
   *
   * Derivar em vez de configurar elimina a classe de bug mais chata aqui: um
   * `MCP_RESOURCE_URL` que não bate com o host real faz o documento de descoberta
   * anunciar um recurso diferente do que o cliente acessou, e a autenticação falha
   * com uma mensagem que não ajuda ninguém. Só configure para forçar outro valor
   * (ex.: atrás de um proxy que reescreve o host).
   */
  MCP_RESOURCE_URL?: string;
}

/** Client que fala com o PostgREST carregando o token do usuário. */
function clientDoUsuario(env: Env, token: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * O verificador é caro (o `createRemoteJWKSet` guarda as chaves em memória) e vive
 * pelo isolate inteiro. O handler em si é um fechamento barato, montado por origem —
 * é o que permite derivar a URL do recurso da requisição sem perder o cache do JWKS.
 */
let verificadorCache: ((token: string) => Promise<TokenClaims | null>) | null = null;

function obterHandler(env: Env, origem: string): (req: Request) => Promise<Response> {
  const issuer = `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
  verificadorCache ??= criarVerificadorDeToken(issuer);

  return criarHandlerMcp({
    resourceUrl: (env.MCP_RESOURCE_URL ?? origem).replace(/\/$/, ""),
    authorizationServer: issuer,
    verificarToken: verificadorCache,
    criarDataSource: (token) => supabaseDataSource(clientDoUsuario(env, token)),

    // Lista de BLOQUEIO, não de permissão. Com registro dinâmico, cada conexão do
    // Claude gera um client_id novo — uma lista de permitidos nunca ficaria
    // satisfeita. Por padrão passa; barra só quem foi desativado. Ver clientes.ts.
    autorizarCliente: async (claims, token) => {
      const clientId = claims.client_id;
      if (!clientId) return decidirSobreConector(undefined, null);

      const { data, error } = await clientDoUsuario(env, token)
        .from("mcp_clients")
        .select("nome, ativo")
        .eq("client_id", clientId)
        .maybeSingle();

      // Falha ao consultar não vira porta fechada: as defesas que importam
      // (consentimento, RLS, blindagem de escrita) seguem valendo sem esta checagem.
      if (error) {
        console.error("mcp_clients:", error.message);
        return null;
      }
      return decidirSobreConector(clientId, data);
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({
          error: "Worker mal configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    return obterHandler(env, new URL(request.url).origin)(request);
  },
};
