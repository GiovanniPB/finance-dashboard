# MCP de Insights — go-live (Supabase + Cloudflare)

> Passo a passo do que precisa ser feito **fora do repositório** para o connector
> entrar no ar. Tudo aqui é operado pelo dono do repo: nem o deploy do Cloudflare nem
> a configuração do Supabase remoto são feitos por agente.
>
> Contexto e decisões: [`mcp-insights-plan.md`](mcp-insights-plan.md).

## Ordem

O banco primeiro, o Worker depois, o connector por último. Cada etapa é verificável
sozinha — não avance sem o "como conferir" passar.

---

## 1. Supabase — migrations

```sh
bun run db:reset          # do zero, local, antes de qualquer coisa
bun run db:push           # aplica no remoto
bun run db:types:local    # regenera src/types/database.ts se necessário
```

Quatro migrations entram:

| Migration                          | O que faz                                             |
| ---------------------------------- | ----------------------------------------------------- |
| `..._mcp_api_schema_e_sandbox_sql` | schema `mcp_api`, views, `run_query`, `mcp_query_log` |
| `..._mcp_oauth_sem_escrita`        | 117 policies restritivas: token de OAuth não escreve  |
| `..._mcp_clients`                  | lista de conectores autorizados + `client_id` no log  |

**Como conferir:** no SQL editor do remoto,

```sql
select count(*) from pg_policies
where schemaname = 'public' and policyname like 'oauth_sem_escrita%';
-- esperado: 3 × (nº de tabelas com RLS, menos mcp_query_log)
```

⚠️ A migration do schema concede `select` a `authenticated` em cinco tabelas-base.
No remoto isso é no-op (o privilégio já existe). Se der erro, pare e investigue: é
sinal de que o remoto diverge mais do que mapeamos (ver §5.1 do plano).

---

## 2. Supabase — OAuth 2.1 Server

No dashboard: **Authentication → OAuth Server**.

1. **Enable OAuth server.**
2. **Authorization URL path**: `/oauth/consent` — é a rota que o SPA já serve.
3. **Allow dynamic client registration**: **ligado**. O claude.ai se registra
   sozinho; sem isso, cada cliente teria de ser cadastrado à mão.

O que isso protege, já que registro dinâmico soa arriscado: um cliente registrado
sozinho ainda precisa (a) do consentimento explícito do usuário na nossa tela e
(b) não estar bloqueado em `mcp_clients` — a lista de bloqueio, que existe para você
revogar um conector na hora.

**Como conferir:**

```sh
curl -s https://vbeevkjenvgvnattzszt.supabase.co/auth/v1/.well-known/oauth-authorization-server | jq .
```

Deve trazer `authorization_endpoint`, `token_endpoint`, `jwks_uri` e — por causa do
registro dinâmico — `registration_endpoint`.

⚠️ **Conferir também a forma com caminho inserido**, que é a que a RFC 8414 manda o
cliente MCP tentar primeiro:

```sh
curl -si https://vbeevkjenvgvnattzszt.supabase.co/.well-known/oauth-authorization-server/auth/v1 | head -1
```

No stack local isso dá 404. Se der 404 no remoto também, o cliente depende de achar o
caminho pelo header `WWW-Authenticate` do nosso 401 — que o Worker envia. O Claude
segue esse header; outros clientes podem não seguir.

---

## 3. Supabase — Site URL

**Authentication → URL Configuration → Site URL** precisa apontar para a URL de
produção do SPA (não `localhost`). É a base que o `authorize` usa para montar o
redirect para `/oauth/consent`; se estiver errada, o usuário é mandado para o lugar
errado no meio do consentimento.

---

## 4. Cloudflare — deploy do Worker

```sh
bun run mcp:worker:check    # compila sem publicar
bun run mcp:worker:deploy   # publica
```

### Variáveis

Elas vivem em `workers/mcp/wrangler.jsonc`, **não no dashboard** — `wrangler deploy`
sobrescreve as variáveis do dashboard com o que está no arquivo, então deixá-las só lá
significa perdê-las no próximo deploy.

| Variável            | Onde             | Valor                                                        |
| ------------------- | ---------------- | ------------------------------------------------------------ |
| `SUPABASE_URL`      | `wrangler.jsonc` | `https://vbeevkjenvgvnattzszt.supabase.co`                   |
| `SUPABASE_ANON_KEY` | `wrangler.jsonc` | a publishable key do projeto                                 |
| `MCP_RESOURCE_URL`  | —                | **não precisa**: o Worker usa a origem da própria requisição |

**Nenhuma é segredo** — são as mesmas chaves públicas que o front embute no bundle. O
Worker não tem service role, de propósito. Se parecer que falta uma chave secreta aqui,
algo está errado no desenho.

`MCP_RESOURCE_URL` existe como escape (proxy que reescreve o host), mas deixá-la
indefinida é melhor: uma URL configurada que não bate com o host real faz o documento
de descoberta anunciar um recurso diferente do que o cliente acessou, e a autenticação
falha com uma mensagem que não ajuda ninguém.

Para rodar local, copie `workers/mcp/.dev.vars.example` para `.dev.vars` (git-ignored)
apontando para o stack local — no `wrangler dev` ele tem precedência.

### Domínio próprio (importante)

Use um custom domain — `mcp.seudominio.com.br` — e não o `*.workers.dev`. Motivo: o
cliente MCP busca `/.well-known/oauth-protected-resource` na **raiz** do host. Com
domínio próprio essa rota é sua. `MCP_RESOURCE_URL` tem de ser exatamente a URL
pública final, sem barra no fim.

⚠️ **Nunca mova o `wrangler.jsonc` para a raiz do repositório.** Na raiz, o build do
Cloudflare Pages passa a lê-lo e ignora as variáveis de build do dashboard — foi o
que quebrou o deploy do SPA em 30/07/2026 (README, seção "Não adicione wrangler.toml").

**Como conferir:**

```sh
curl -s https://mcp.seudominio.com.br/.well-known/oauth-protected-resource | jq .
```

Deve devolver `resource` igual à sua URL e `authorization_servers` apontando para
`https://vbeevkjenvgvnattzszt.supabase.co/auth/v1`.

---

## 5. Conectar o Claude

Em **Settings → Connectors → Add custom connector**, com a URL do Worker do MCP. O
Claude detecta sozinho que o servidor exige autenticação e que há registro dinâmico —
as duas opções vêm marcadas como "Detectado". Não escolha a alternativa de metadados
hospedados pela Anthropic (CIMD): o Supabase ainda não suporta.

Ao conectar, o Claude registra um cliente, o Supabase te manda para a nossa tela de
consentimento, e depois de aprovar o conector já funciona. **Nada a liberar.**

⚠️ **Cada conexão registra um `client_id` NOVO.** É como o registro dinâmico funciona;
quatro tentativas geram quatro clientes em `auth.oauth_clients`. Não tente autorizar
um id específico — a lista de bloqueio existe para o caminho inverso, o de tirar
acesso. Para saber quais conectores estão de fato em uso:

```sql
select client_id, count(*), max(created_at)
from public.mcp_query_log group by client_id order by 3 desc;
```

Cada pessoa entra com o próprio login e enxerga exatamente o que enxergaria na
interface — mesmas empresas, mesmos módulos, somente leitura.

## 6. Depois de no ar

- **Quem usou o quê:** `select * from public.mcp_query_log order by created_at desc;`
- **Revogar um conector para todo mundo:** `insert into public.mcp_clients (client_id, nome, ativo) values ('…', 'Claude', false);`
  (o id sai de `mcp_query_log`). Efeito imediato: o Worker passa a devolver 403.
- **Revogar o acesso de uma pessoa:** ela remove o app em Settings do claude.ai, ou
  o super admin tira a empresa/módulo do usuário — a RLS faz o resto.
- **Tirar tudo do ar:** desligar o OAuth Server no dashboard do Supabase derruba a
  emissão de token; os existentes expiram sozinhos.

## O que continua verdadeiro faça o que fizer

Nenhuma dessas etapas dá poder de escrita a uma IA. Mesmo que o Worker seja
comprometido, mesmo que um token vaze, o banco recusa `INSERT`/`UPDATE`/`DELETE` de
qualquer token de OAuth — é policy restritiva, não disciplina de código. E o que cada
pessoa lê continua sendo decidido pela RLS que já governa a interface.
