/**
 * Servidor MCP local (transporte stdio) — Fase 0/1 do plano de insights.
 *
 * Roda na sua máquina e aparece como servidor MCP em qualquer cliente que fale
 * stdio (Claude Code, Claude Desktop, Cursor). Serve para validar o catálogo de
 * tools e a qualidade das respostas ANTES de existir servidor remoto, OAuth ou
 * qualquer superfície exposta.
 *
 * Autenticação: o seu próprio login da plataforma. O client usa a anon key + a
 * sessão do usuário — nunca service role — de modo que a RLS decide o que aparece.
 * Consequência: este servidor não enxerga nada que você já não enxergasse na UI.
 *
 * Configuração (variáveis de ambiente, definidas no cliente MCP):
 *   MCP_SUPABASE_URL         (ou VITE_SUPABASE_URL)
 *   MCP_SUPABASE_ANON_KEY    (ou VITE_SUPABASE_ANON_KEY)
 *   MCP_SUPABASE_EMAIL       e-mail do seu login
 *   MCP_SUPABASE_PASSWORD    senha do seu login
 *
 * ⚠️ stdout é o canal JSON-RPC. Todo log vai para stderr, sempre.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseDataSource } from "../supabase/functions/_shared/mcp/datasource.ts";
import { callTool, isFailure, listTools } from "../supabase/functions/_shared/mcp/registry.ts";

const NOME = "otm-financeiro";
const VERSAO = "0.1.0";

interface Config {
  url: string;
  anonKey: string;
  email: string;
  password: string;
}

function lerConfig(): Config {
  const env = process.env;
  const url = env.MCP_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const anonKey = env.MCP_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  const email = env.MCP_SUPABASE_EMAIL;
  const password = env.MCP_SUPABASE_PASSWORD;

  const obrigatorias = {
    MCP_SUPABASE_URL: url,
    MCP_SUPABASE_ANON_KEY: anonKey,
    MCP_SUPABASE_EMAIL: email,
    MCP_SUPABASE_PASSWORD: password,
  };
  const faltando = Object.entries(obrigatorias)
    .filter(([, valor]) => !valor)
    .map(([nome]) => nome);

  if (faltando.length > 0) {
    console.error(
      `[${NOME}] Configuração incompleta. Faltando: ${faltando.join(", ")}.\n` +
        "Defina essas variáveis no cliente MCP (não em arquivo no repositório).",
    );
    process.exit(1);
  }
  return {
    url: String(url),
    anonKey: String(anonKey),
    email: String(email),
    password: String(password),
  };
}

/**
 * Login preguiçoso e memoizado.
 *
 * O servidor sobe e anuncia as tools sem tocar na rede: um cliente MCP que só
 * lista ferramentas não deve falhar por credencial. A sessão só é criada quando a
 * primeira tool é de fato chamada.
 */
function autenticador(config: Config): () => Promise<SupabaseClient> {
  let pendente: Promise<SupabaseClient> | null = null;

  return () => {
    pendente ??= (async () => {
      const client = createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: true },
      });
      const { data, error } = await client.auth.signInWithPassword({
        email: config.email,
        password: config.password,
      });
      if (error || !data.session) {
        pendente = null; // permite nova tentativa na próxima chamada
        throw new Error(
          `Falha ao autenticar como ${config.email}: ${error?.message ?? "sem sessão"}`,
        );
      }
      console.error(`[${NOME}] autenticado como ${config.email}`);
      return client;
    })();
    return pendente;
  };
}

async function main(): Promise<void> {
  const config = lerConfig();
  const autenticar = autenticador(config);

  const server = new Server({ name: NOME, version: VERSAO }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: listTools() }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const inicio = Date.now();
    try {
      const client = await autenticar();
      const outcome = await callTool(name, args ?? {}, supabaseDataSource(client));
      console.error(`[${NOME}] ${name} em ${Date.now() - inicio}ms`);
      if (isFailure(outcome)) {
        return { content: [{ type: "text", text: outcome.erro }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(outcome) }] };
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : String(err);
      console.error(`[${NOME}] ${name} falhou: ${detalhe}`);
      return { content: [{ type: "text", text: detalhe }], isError: true };
    }
  });

  await server.connect(new StdioServerTransport());
  console.error(`[${NOME}] pronto — ${listTools().length} tools, somente leitura`);
}

main().catch((err: unknown) => {
  console.error(`[${NOME}] erro fatal:`, err);
  process.exit(1);
});
