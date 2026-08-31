import { describe, expect, it, vi } from "vitest";

import { fakeDataSource } from "./fixtures.ts";
import {
  CAMINHO_METADADOS,
  criarHandlerMcp,
  PROTOCOL_VERSION,
  type HandlerConfig,
  type RegistroDeUso,
} from "./http.ts";

const BASE = "https://mcp.exemplo.com";
const COMPANY = "11111111-2222-3333-4444-555555555555";

function criar(overrides: Partial<HandlerConfig> = {}, registros: RegistroDeUso[] = []) {
  const config: HandlerConfig = {
    resourceUrl: BASE,
    authorizationServer: "https://projeto.supabase.co/auth/v1",
    verificarToken: (t) =>
      Promise.resolve(t === "token-bom" ? { sub: "user-1", client_id: "cli_1" } : null),
    criarDataSource: () =>
      fakeDataSource({ query: { companies: [] }, rpc: { dre_by_company: [] } }),
    registrarUso: (r) => {
      registros.push(r);
      return Promise.resolve();
    },
    ...overrides,
  };
  return criarHandlerMcp(config);
}

function rpc(body: unknown, token = "token-bom") {
  return new Request(`${BASE}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("descoberta e CORS", () => {
  it("serve os metadados do recurso SEM exigir token — é o que o cliente lê antes de ter um", async () => {
    const r = await criar()(new Request(`${BASE}${CAMINHO_METADADOS}`));
    expect(r.status).toBe(200);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body.resource).toBe(BASE);
    expect(body.authorization_servers).toEqual(["https://projeto.supabase.co/auth/v1"]);
  });

  it("responde ao preflight", async () => {
    const r = await criar()(new Request(`${BASE}/`, { method: "OPTIONS" }));
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("recusa método fora de POST/GET", async () => {
    const r = await criar()(new Request(`${BASE}/`, { method: "DELETE" }));
    expect(r.status).toBe(405);
  });
});

describe("autorização", () => {
  it("sem token: 401 apontando o caminho dos metadados", async () => {
    const r = await criar()(new Request(`${BASE}/`, { method: "POST" }));
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain(`${BASE}${CAMINHO_METADADOS}`);
  });

  it("token inválido: 401, e a tool nunca é chamada", async () => {
    const criarDataSource = vi.fn(() => fakeDataSource());
    const handler = criar({ criarDataSource });
    const r = await handler(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "token-ruim"));
    expect(r.status).toBe(401);
    expect(criarDataSource).not.toHaveBeenCalled();
  });

  it("header Authorization malformado é tratado como ausente", async () => {
    const r = await criar()(
      new Request(`${BASE}/`, { method: "POST", headers: { Authorization: "token-bom" } }),
    );
    expect(r.status).toBe(401);
  });
});

describe("JSON-RPC", () => {
  it("initialize anuncia protocolo e capacidade de tools", async () => {
    const r = await criar()(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const body = (await r.json()) as { result: Record<string, unknown> };
    expect(body.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(body.result.capabilities).toEqual({ tools: {} });
  });

  it("tools/list devolve o catálogo", async () => {
    const r = await criar()(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const body = (await r.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.map((t) => t.name)).toContain("get_dre");
  });

  it("notificação (sem id) não gera resposta", async () => {
    const r = await criar()(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(r.status).toBe(202);
    expect(await r.text()).toBe("");
  });

  it("método desconhecido vira erro -32601", async () => {
    const r = await criar()(rpc({ jsonrpc: "2.0", id: 3, method: "resources/list" }));
    const body = (await r.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  it("JSON quebrado vira erro -32700", async () => {
    const r = await criar()(
      new Request(`${BASE}/`, {
        method: "POST",
        headers: { Authorization: "Bearer token-bom", "Content-Type": "application/json" },
        body: "{ nao é json",
      }),
    );
    const body = (await r.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it("batch é recusado explicitamente", async () => {
    const r = await criar()(rpc([{ jsonrpc: "2.0", id: 1, method: "ping" }]));
    const body = (await r.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toMatch(/Batch/);
  });
});

describe("tools/call", () => {
  it("devolve o resultado da tool como texto JSON", async () => {
    const r = await criar()(
      rpc({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "list_companies", arguments: {} },
      }),
    );
    const body = (await r.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(body.result.isError).toBeUndefined();
    const payload = JSON.parse(body.result.content[0].text) as { meta: { fonte: string } };
    expect(payload.meta.fonte).toContain("companies");
  });

  it("erro de parâmetro vira isError, não exceção", async () => {
    const r = await criar()(
      rpc({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "get_dre", arguments: { from: "2026-07-01", to: "2026-07-31" } },
      }),
    );
    const body = (await r.json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/list_companies/);
  });

  it("exige o nome da tool", async () => {
    const r = await criar()(rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: {} }));
    const body = (await r.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32602);
  });

  it("registra a chamada na trilha de uso", async () => {
    const registros: RegistroDeUso[] = [];
    const handler = criar({}, registros);
    await handler(
      rpc({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "list_companies", arguments: { incluir_inativas: true } },
      }),
    );
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      userId: "user-1",
      tool: "list_companies",
      params: { incluir_inativas: true },
      error: null,
    });
  });

  it("registra também a falha, com a mensagem", async () => {
    const registros: RegistroDeUso[] = [];
    const handler = criar({}, registros);
    await handler(
      rpc({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "get_cashflow", arguments: {} },
      }),
    );
    expect(registros[0].error).toMatch(/company_id/);
    expect(registros[0].rowCount).toBeNull();
  });

  it("falha ao registrar o uso NÃO derruba a resposta", async () => {
    const handler = criar({ registrarUso: () => Promise.reject(new Error("log fora do ar")) });
    const r = await handler(
      rpc({
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "list_companies", arguments: {} },
      }),
    );
    expect(r.status).toBe(200);
  });

  it("passa o token adiante para a fonte de dados agir como o usuário", async () => {
    const criarDataSource = vi.fn(() => fakeDataSource({ query: { companies: [] } }));
    const handler = criar({ criarDataSource });
    await handler(
      rpc({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "list_companies", arguments: {} },
      }),
    );
    expect(criarDataSource).toHaveBeenCalledWith("token-bom", {
      sub: "user-1",
      client_id: "cli_1",
    });
  });
});

describe("company scoping continua sendo do banco", () => {
  it("o handler não filtra empresa: quem decide é a RLS via token", async () => {
    const ds = fakeDataSource({ query: { companies: [] } });
    const handler = criar({ criarDataSource: () => ds });
    await handler(
      rpc({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "search_transactions",
          arguments: { company_id: COMPANY, from: "2026-07-01", to: "2026-07-31" },
        },
      }),
    );
    const filtros = ds.queries[0].filters.map((f) => f.column);
    expect(filtros).toContain("company_id");
  });
});
