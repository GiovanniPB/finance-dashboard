/**
 * Servidor MCP sobre HTTP — independente de host.
 *
 * É uma função `Request -> Response` pura em relação ao ambiente: quem entrega a
 * verificação do token e a fonte de dados é o entrypoint (Edge Function ou
 * Cloudflare Worker). Por isso o mesmo código roda nos dois e é testável por Vitest
 * sem rede, sem banco e sem JWKS.
 *
 * Implementa o mínimo do MCP que um cliente remoto precisa, sobre JSON-RPC:
 * `initialize`, `tools/list`, `tools/call` e `ping`. Responde cada POST com um único
 * JSON — o Streamable HTTP permite isso, e nenhuma tool nossa transmite em partes.
 * Batch não é suportado, e não precisa ser: foi removido na revisão 2025-06-18.
 *
 * A parte de autorização segue a RFC 9728: sem token válido, 401 com
 * `WWW-Authenticate` apontando para o documento de metadados do recurso, que é como
 * o cliente descobre sozinho onde se autenticar.
 */
import { callTool, isFailure, listTools } from "./registry.ts";
import type { McpDataSource } from "./types.ts";

export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "otm-financeiro", version: "0.1.0" } as const;

/** Claims que nos interessam do access token. */
export interface TokenClaims {
  sub: string;
  /** Presente só em token emitido pelo OAuth Server — é o que a RLS usa para barrar escrita. */
  client_id?: string;
  [key: string]: unknown;
}

export interface HandlerConfig {
  /** URL pública deste servidor MCP, sem barra final. Ex.: https://mcp.exemplo.com */
  resourceUrl: string;
  /** Issuer do authorization server. Ex.: https://<ref>.supabase.co/auth/v1 */
  authorizationServer: string;
  /** Valida o access token (JWKS no runtime real). Devolve null se inválido. */
  verificarToken: (token: string) => Promise<TokenClaims | null>;
  /** Cria a fonte de dados já autenticada como o portador do token. */
  criarDataSource: (token: string, claims: TokenClaims) => McpDataSource;
  /**
   * Decide se ESTE conector pode usar o servidor, independente do token ser válido.
   * Devolve o motivo da recusa, ou null para permitir.
   *
   * Separado de `verificarToken` de propósito: token inválido é 401 (autentique-se
   * de novo); conector não autorizado é 403 (autenticar de novo não resolve — alguém
   * precisa liberar o cliente). Confundir os dois faz o cliente entrar em laço de
   * reautenticação sem nunca entender o problema.
   */
  autorizarCliente?: (claims: TokenClaims, token: string) => Promise<string | null>;
  /**
   * Registra a chamada. Recebe o token porque a trilha é gravada COMO O USUÁRIO
   * (a RLS de `mcp_query_log` exige `user_id = auth.uid()`), e o servidor não tem
   * — de propósito — nenhuma credencial de serviço para gravar por fora.
   * Falha aqui nunca derruba a resposta.
   */
  registrarUso?: (registro: RegistroDeUso, token: string) => Promise<void>;
}

export interface RegistroDeUso {
  userId: string;
  /** Qual conector fez a chamada. Ausente em token que não veio do OAuth. */
  clientId: string | null;
  tool: string;
  params: unknown;
  rowCount: number | null;
  durationMs: number;
  error: string | null;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "www-authenticate, mcp-session-id",
} as const;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...headers },
  });
}

function erroJsonRpc(id: unknown, code: number, message: string): Response {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

/** Caminho canônico do documento de metadados do recurso protegido (RFC 9728). */
export const CAMINHO_METADADOS = "/.well-known/oauth-protected-resource";

export function metadadosDoRecurso(config: HandlerConfig): Record<string, unknown> {
  return {
    resource: config.resourceUrl,
    authorization_servers: [config.authorizationServer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "email", "profile"],
    resource_documentation: `${config.resourceUrl}/`,
  };
}

function naoAutorizado(config: HandlerConfig, motivo: string): Response {
  return json({ error: "unauthorized", error_description: motivo }, 401, {
    "WWW-Authenticate":
      `Bearer resource_metadata="${config.resourceUrl}${CAMINHO_METADADOS}", ` +
      `error="invalid_token", error_description="${motivo}"`,
  });
}

function tokenDoHeader(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function criarHandlerMcp(config: HandlerConfig): (req: Request) => Promise<Response> {
  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Descoberta: pública por definição — é o que o cliente lê ANTES de ter token.
    if (req.method === "GET" && url.pathname.endsWith(CAMINHO_METADADOS)) {
      return json(metadadosDoRecurso(config));
    }

    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, { Allow: "POST, GET, OPTIONS" });
    }

    const token = tokenDoHeader(req);
    if (!token) return naoAutorizado(config, "Token de acesso ausente.");

    const claims = await config.verificarToken(token);
    if (!claims) return naoAutorizado(config, "Token de acesso inválido ou expirado.");

    if (config.autorizarCliente) {
      const recusa = await config.autorizarCliente(claims, token);
      if (recusa) {
        return json({ error: "forbidden", error_description: recusa }, 403);
      }
    }

    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return erroJsonRpc(null, -32700, "JSON inválido.");
    }

    if (Array.isArray(corpo)) {
      return erroJsonRpc(null, -32600, "Batch não é suportado nesta versão do protocolo.");
    }
    if (typeof corpo !== "object" || corpo === null) {
      return erroJsonRpc(null, -32600, "Requisição JSON-RPC inválida.");
    }

    const { method, id, params } = corpo as { method?: string; id?: unknown; params?: unknown };
    if (typeof method !== "string") {
      return erroJsonRpc(id, -32600, "Campo 'method' ausente.");
    }

    // Notificação (sem id): nada a responder.
    if (id === undefined) {
      return new Response(null, { status: 202, headers: CORS });
    }

    switch (method) {
      case "initialize":
        return json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          },
        });

      case "ping":
        return json({ jsonrpc: "2.0", id, result: {} });

      case "tools/list":
        return json({ jsonrpc: "2.0", id, result: { tools: listTools() } });

      case "tools/call": {
        const { name, arguments: args } = (params ?? {}) as { name?: string; arguments?: unknown };
        if (typeof name !== "string") {
          return erroJsonRpc(id, -32602, "Parâmetro 'name' ausente em tools/call.");
        }

        const inicio = Date.now();
        const ds = config.criarDataSource(token, claims);
        const resultado = await callTool(name, args ?? {}, ds);
        const falhou = isFailure(resultado);

        if (config.registrarUso) {
          try {
            await config.registrarUso(
              {
                userId: claims.sub,
                clientId: claims.client_id ?? null,
                tool: name,
                params: args ?? {},
                rowCount: falhou ? null : resultado.meta.linhas,
                durationMs: Date.now() - inicio,
                error: falhou ? resultado.erro : null,
              },
              token,
            );
          } catch {
            // Trilha de uso não pode derrubar a resposta ao usuário.
          }
        }

        return json({
          jsonrpc: "2.0",
          id,
          result: falhou
            ? { content: [{ type: "text", text: resultado.erro }], isError: true }
            : { content: [{ type: "text", text: JSON.stringify(resultado) }] },
        });
      }

      default:
        return erroJsonRpc(id, -32601, `Método não suportado: ${method}`);
    }
  };
}
