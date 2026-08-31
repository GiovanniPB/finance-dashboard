# MCP de Insights — conversar com o financeiro em linguagem natural

> **Propósito deste documento:** desenhar e planejar um servidor **MCP somente-leitura**
> que exponha os dados financeiros do grupo OTM a qualquer IA (claude.ai, ChatGPT,
> Claude Code, agentes próprios), sem perder a autorização nem a semântica contábil
> que a plataforma já garante.
>
> **Status:** rascunho de projeto — nada implementado.
> **Última atualização:** 31/08/2026.
>
> Documentos irmãos: [`pagarme-system.md`](pagarme-system.md) e
> [`nfse-system.md`](nfse-system.md) (os dois maiores produtores de dado que o MCP vai ler).

---

## 1. O problema

O dashboard responde bem as perguntas que alguém previu ao desenhar a tela. A DRE tem
as linhas que a DRE tem; o `/vendas` tem os cortes que foram implementados. O que não
existe é a **cauda longa**:

- "Por que o caixa da Assessoria caiu 18% em julho contra junho?"
- "Quais centros de custo cresceram acima da receita nos últimos 6 meses?"
- "Quanto do meu MRR depende dos 5 maiores clientes, e o que acontece se dois saírem?"
- "Tem alguma despesa recorrente que subiu mais que a inflação e ninguém percebeu?"

Cada uma dessas hoje custa: abrir 3 ou 4 telas, exportar, cruzar no Excel. Ou uma
migration nova, se virar recorrente. Um MCP transforma isso em uma pergunta.

**Isto não substitui o dashboard.** O dashboard continua sendo a fonte visual e o
lugar de operar. O MCP é a camada de _investigação_.

---

## 2. Por que não usar o MCP oficial do Supabase

Ele existe, roda SQL e levaria 10 minutos para configurar. É a solução errada aqui:

1. **Autentica como admin** (PAT / service role) e **bypassa RLS**. Todo o modelo de
   permissão de três eixos (empresa × papel × módulo) deixa de existir no instante em
   que a IA entra. Um contador com escopo fiscal passaria a enxergar folha.
2. **Produz número plausível e errado.** Um LLM escrevendo SQL contra `transactions`
   soma `amount` sem sinal, ignora `status`, confunde `accrual_date` com
   `settlement_date`, conta transferência entre contas como receita e desconhece a
   projeção do pagar.me. A migration `dre_competencia_inclui_pendente` documenta a
   armadilha: competência inclui `pending`, caixa não, `scheduled` fica fora dos dois.
   Nenhum modelo adivinha isso lendo o schema.
3. **Tem ferramentas de escrita** (`apply_migration`, `execute_sql`). Num sistema
   contábil isso não deveria estar a um prompt de distância.

O ativo real do nosso MCP não é acesso ao banco — é **a garantia de que o número que a
IA cita é o mesmo número da tela.**

---

## 3. Decisões

| #      | Decisão                | Escolha                                                | Consequência                                                                                                         |
| ------ | ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **D1** | Quem consome           | Sócios e contador em **claude.ai / ChatGPT**           | Servidor **remoto** (Streamable HTTP). O OAuth 2.1 é **nativo do Supabase** (§4.4) — deixou de ser o item mais caro. |
| **D2** | Superfície de consulta | **Híbrido**: tools semânticas + `sql_query` só-leitura | Número contábil sempre vem de RPC revisada; exploração livre acontece num schema contido.                            |
| **D3** | Escopo de dado         | **Total** — financeiro, vendas, fiscal e folha         | LGPD e mascaramento de PII viram requisito de projeto, não nota de rodapé.                                           |

Decorrências que não são escolha, são consequência:

- **D4 — Identidade é o próprio login Supabase de cada pessoa.** Cada sócio/contador
  autoriza o connector com a conta que já tem na plataforma.
- **D5 — Autorização é a RLS existente.** Zero regra de permissão nova no MCP. O
  servidor **nunca** usa service role no caminho de dados. Precedente no repo:
  `admin-create-user` identifica o chamador com anon key + JWT antes de escalar.
- **D6 — Consentimento explícito.** A tela de autorização lista empresas e módulos que
  aquele acesso concede, e o super admin revoga a qualquer momento.
- **D7 — Mascaramento por padrão.** CPF/CNPJ mascarado; folha nominal só com o módulo
  `payroll` no escopo e sob flag explícita.

---

## 4. Arquitetura

```
  claude.ai · ChatGPT · Claude Code · agentes próprios
        │
        │  MCP sobre Streamable HTTP  +  OAuth 2.1 (PKCE, DCR)
        ▼
  ┌─────────────────────────────────────────────┐
  │  servidor MCP  (Edge Function ou Worker)     │
  │                                              │
  │  tools semânticas ──→ RPCs `security invoker`│
  │  sql_query ────────→ schema `mcp_api`        │
  │  resources/prompts → glossário, dicionário   │
  │  toda chamada ────→ mcp_query_log            │
  └─────────────────────────────────────────────┘
        │
        │  PostgREST com **JWT do usuário** (anon key). Nunca service role.
        ▼
     Postgres 17 + RLS (company_access × role × visible_modules)
```

### 4.1 Identidade e autorização

O servidor recebe um token OAuth próprio, resolve para a sessão Supabase do usuário e
faz **todas** as chamadas de dado com esse JWT. Consequências práticas:

- A RLS decide tudo. Não há caminho em que o MCP veja mais do que a UI veria para a
  mesma pessoa.
- As policies novas seguem a convenção de performance do projeto (predicado sem
  dependência de linha dentro de `(select …)`, escopo por `coluna in (subquery)`) —
  ver `…_rls_initplan_optimization`. O `statement_timeout` do papel `authenticated` é
  de 8s e o sandbox SQL vai usar um limite ainda menor.
- Camada extra barata: role `mcp_ro` com `grant select` apenas nas views do schema
  `mcp_api` e `execute` apenas nas RPCs `stable`. Mesmo um bug de lógica no servidor
  não consegue escrever.

### 4.2 Camada semântica — o coração

Cada tool é **uma pergunta de negócio**, não uma tabela. As RPCs já existentes viram
tools quase 1:1 — este é o motivo pelo qual o projeto é viável em semanas e não meses.

| Domínio    | Tool                                                                       | RPC / fonte                                                                        |
| ---------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Contexto   | `describe_data`, `list_companies`, `list_accounts`, `list_cost_centers`    | `companies`, `chart_of_accounts`, `cost_centers`, `company_stats`                  |
| Resultado  | `get_dre` (competência \| caixa), `compare_periods`, `expense_breakdown`   | `dre_by_company`, `dre_consolidated`, `dre_comparison`, `expense_breakdown`        |
| KPIs       | `get_kpis`                                                                 | `kpi_dashboard`, `kpi_dashboard_consolidated`                                      |
| Caixa      | `get_cashflow`, `get_bank_balances`, `get_account_ledger`                  | `cashflow_daily`, `cashflow_monthly`, `bank_balances_multi`, `bank_account_ledger` |
| Previsão   | `forecast_cashflow`                                                        | `forecast_cashflow_daily`, `forecast_pagarme_inflow`                               |
| AP/AR      | `get_aging`, `get_receivables_schedule`, `list_open_bills`                 | aging por faixa, `receivables_schedule`                                            |
| Analítico  | `cost_center_analysis`, `counterparty_analysis`, `balanco_gerencial`       | RPCs homônimas                                                                     |
| Vendas     | `sales_overview`, `sales_breakdown`, `sales_customers`, `sales_recurrence` | RPCs homônimas                                                                     |
| Fiscal     | `list_tax_obligations`, `nfse_status`                                      | `tax_obligations`, `invoice_jobs`                                                  |
| Folha      | `payroll_summary`, `payroll_run_detail` _(gated por módulo)_               | `payroll_runs`, `payroll_items`                                                    |
| Busca      | `search_transactions`                                                      | filtros estruturados, agregado por padrão, teto de linhas                          |
| Exploração | `sql_query`                                                                | schema `mcp_api` (§4.3)                                                            |
| Composta   | `monthly_briefing(company, month)`                                         | pacote coerente numa chamada só                                                    |

Três regras que separam "brinquedo" de "ferramenta em que você confia":

1. **Toda resposta carrega os próprios metadados**: empresa, período, regime, status
   incluídos, moeda e uma linha de _como foi calculado_. A IA passa a citar isso, e a
   conclusão fica auditável sem abrir o dashboard.
2. **Nenhum parâmetro implícito.** Sem empresa e sem período, a tool não responde —
   pergunta. Metade dos erros de análise por IA nasce de um default silencioso.
3. **Tool composta contra tagarelice.** Um panorama mensal em 8 chamadas custa caro,
   demora e erra na agregação. `monthly_briefing` devolve o pacote inteiro coerente.

Além de tools, o servidor expõe **resources** (glossário do negócio: regime, status,
o que é transferência, o que é projeção pagar.me, data de corte) e **prompts**
prontos ("fechamento do mês", "por que o caixa caiu", "concentração de clientes").

### 4.3 Sandbox SQL

O `sql_query` é o que cobre a pergunta que ninguém previu. Contenção:

- **Schema próprio `mcp_api`**, não `public`. Só views, todas `security_invoker = true`
  (a RLS do usuário continua valendo) e já com a semântica aplicada: valor com sinal,
  `deleted_at is null`, status explicitado em coluna, transferência marcada como tal.
- Role `mcp_ro` com `usage` apenas em `mcp_api`. `pg_catalog`, `auth`, `vault` e
  `storage` fora de alcance.
- `set transaction read only`, statement único, apenas `select`, `statement_timeout`
  de 5s, `LIMIT` forçado (máx. 1.000 linhas).
- Rate limit por usuário e registro em `mcp_query_log`.

O ponto sutil: as views de `mcp_api` **são** documentação executável. É delas que o
`describe_data` deriva o dicionário que a IA lê antes de escrever SQL.

### 4.4 Transporte e OAuth — resolvido pelo Supabase

> **Spike S1 resolvido em 31/08/2026.** O Supabase Auth ganhou um **OAuth 2.1 Server
> nativo** (beta público desde 26/11/2025, ainda em beta e gratuito em todos os planos
> em ago/2026). Ele implementa exatamente o que o MCP exige, e **elimina a Rota A**
> (Cloudflare Worker com AS próprio) do plano.

O que vem pronto:

| Requisito do MCP            | Como o Supabase entrega                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Authorization server        | `/.well-known/oauth-authorization-server/auth/v1` do próprio projeto                        |
| Authorization code + PKCE   | `/auth/v1/oauth/authorize` e `/auth/v1/oauth/token`                                         |
| Dynamic Client Registration | flag no dashboard (Authentication → OAuth Server); o claude.ai se registra sozinho          |
| Validação de token          | JWKS em `/auth/v1/.well-known/jwks.json` — o resource server valida offline                 |
| Identidade                  | os usuários que já existem na plataforma                                                    |
| Autorização                 | o access token é um **JWT Supabase normal** → a RLS existente se aplica sem nenhuma mudança |

O que **nós** construímos encolhe para duas coisas:

1. **A tela de consentimento** — uma rota nova no SPA que já existe (o `authorization_url_path`
   aponta para ela). O fluxo é curto: ler `authorization_id` da query, exigir login,
   `supabase.auth.oauth.getAuthorizationDetails()` para saber quem está pedindo e o quê,
   mostrar em português claro **quais empresas e módulos** aquele acesso enxerga, e então
   `approveAuthorization()` / `denyAuthorization()`. É uma página, não um servidor OAuth.
2. **O resource server** — a Edge Function MCP: publica
   `/.well-known/oauth-protected-resource`, responde 401 com
   `WWW-Authenticate: Bearer resource_metadata="…"` quando falta token, valida o JWT pelo
   JWKS e usa esse mesmo token para falar com o PostgREST.

Dá para desenvolver e testar **local**: CLI ≥ 2.54.11 (temos 2.111.0) habilita por
`config.toml`:

```toml
[auth.oauth_server]
enabled = true
authorization_url_path = "/oauth/consent"
allow_dynamic_registration = false   # true só no remoto, para o claude.ai se registrar
```

#### O buraco que isso abre — e como fechamos

O OAuth Server ainda **não tem escopos** ("na roadmap, sem ETA", mantenedor em mar/2026).
Consequência crua: **o token emitido ao claude.ai tem todos os privilégios do usuário,
inclusive escrita.** Um token vazado escreveria no banco via PostgREST sem passar pelo
nosso servidor. Isso é inaceitável num sistema contábil e é o problema central do projeto.

A trava existe e é barata: o JWT emitido pelo OAuth Server carrega a claim **`client_id`**,
que **um login normal do app não tem**. Então:

```sql
-- toda policy de INSERT/UPDATE/DELETE ganha este predicado:
and (select auth.jwt() ->> 'client_id') is null
```

Leia-se: _token nascido de OAuth não escreve, nunca, em nenhuma tabela, seja qual for o
cliente._ Fica dentro de `(select …)` para virar InitPlan, conforme a convenção de RLS do
projeto. É uma migration mecânica sobre as policies de escrita, e é o que transforma
"somente-leitura" de promessa do servidor em **garantia do banco**.

Em cima disso, uma tabela `mcp_clients` (`client_id` → empresas e módulos permitidos)
devolve o conceito de escopo que falta no Supabase: o connector do contador enxerga menos
que o próprio contador, se quisermos. É o nosso substituto de escopo até o Supabase
entregar o dele.

#### Riscos desta rota

- **Beta.** Sem ETA de GA. A API de consentimento pode mudar; escopos podem chegar e
  mudar o desenho. Mitigação: a superfície que dependemos dela é uma página e três
  chamadas de SDK.
- **DCR aberto** deixa qualquer cliente MCP se registrar. Mitigação: manter
  `allow_dynamic_registration` ligado só quando necessário, e a tela de consentimento é
  quem de fato autoriza.
- **`SITE_URL` único** — limitação conhecida do fluxo. Não nos afeta: um SPA só.

Compatibilidade com ChatGPT tem exigência própria (tools `search` e `fetch` para deep
research) — resolver com aliases finos sobre `search_transactions` e as tools de detalhe.
Verificar no spike S2.

---

## 5. Mudanças no banco

Tudo por migration, testado com `db:reset` antes de `db:push`, seguindo
[`docs/database/migrations.md`](../database/migrations.md).

1. `schema mcp_api` + views `security_invoker` (transações com sinal e regime,
   contas, centros de custo, contrapartes, vendas, recebíveis, obrigações fiscais,
   folha agregada).
2. `role mcp_ro` + grants mínimos.
3. `mcp_query_log` — `user_id`, `tool`, `params jsonb`, `row_count`, `duration_ms`,
   `created_at`. **Sem conteúdo de linha** (só parâmetros), com retenção definida.
4. `mcp_tokens` — token pessoal com hash, escopo (empresas, módulos), expiração e
   revogação. Habilita a Fase 3 e serve de plano B se o OAuth atrasar.
5. **Blindagem de escrita**: predicado `and (select auth.jwt() ->> 'client_id') is null`
   em todas as policies de INSERT/UPDATE/DELETE (§4.4). Migration mecânica, com teste
   que prova que um token OAuth recebe `42501` ao tentar escrever.
6. `mcp_clients` — `client_id` → empresas e módulos permitidos. O escopo que o
   Supabase ainda não tem.
7. RLS em toda tabela nova, no padrão InitPlan da convenção do projeto.

---

## 6. LGPD e dado sensível

Escopo total (D3) significa que salários, nomes de funcionários, CPF/CNPJ de
contrapartes e tomadores de NFS-e podem sair da infraestrutura em direção à
Anthropic/OpenAI. Regras do projeto:

- **Agregado por padrão.** `payroll_summary` devolve totais por rubrica/centro de
  custo. Nominal exige módulo `payroll` **e** flag explícita na chamada.
- **CPF mascarado** em toda saída (`***.456.789-**`), sem exceção de tool. **CNPJ passa
  inteiro**: é dado público de pessoa jurídica na Receita e é justamente ele que identifica
  o fornecedor numa análise — mascarar custaria utilidade sem proteger ninguém.
- **`can_view_module` já resolve o contador**: escopo `{financials,taxes,nfse}` não
  alcança folha, pela mesma policy que o barra na UI.
- **Consentimento no OAuth** lista o que aquele acesso enxerga, em português claro.
- **Log sem PII**: parâmetros sim, linhas não.
- Decisão do dono do repo, registrada aqui: aceitar o envio desses dados a um provedor
  de LLM é uma escolha de negócio, e o desenho acima é o que a torna reversível
  (revogação por token, escopo por módulo, log de tudo).

---

## 7. Invariantes (não-negociáveis)

1. **O servidor MCP nunca usa service role no caminho de dados.** Toda leitura é com
   o JWT do usuário e passa por RLS.
2. **Nenhuma tool de escrita. Nunca.** Nem "só para marcar como conciliado". Se um dia
   precisar, é outro servidor, com outra autenticação e outra revisão.
3. **Número contábil vem de RPC revisada**, não de SQL gerado por modelo. O
   `sql_query` é para exploração; a DRE é a DRE.
4. **Toda chamada é logada** em `mcp_query_log`.
5. **Token de OAuth não escreve** — garantido pelo predicado `client_id is null` nas
   policies de escrita, no banco, não no código do servidor.
6. **Nenhum segredo no cliente.** Token OAuth é do servidor; chaves do pagar.me/Focus
   e o service role continuam onde estão.

---

## 8. Plano de execução

Cada fase entrega algo utilizável sozinha. O núcleo (`_shared/mcp/`) é Deno-puro,
testado por Vitest, e o transporte é casca fina — é isso que impede as fases de virarem
três reescritas.

### Fase 0 — Spikes e prova de conceito · _pequena_

- S1: estado do OAuth (§9) → decide Rota A vs B.
- S2: exigências atuais de connector do claude.ai e do ChatGPT.
- Protótipo stdio com 3 tools (`get_dre`, `get_cashflow`, `search_transactions`)
  lendo o banco remoto em modo leitura.
- **Pronto quando:** você conversa com a DRE de julho no Claude Code e os números
  batem com a tela.

### Fase 1 — Núcleo semântico · _grande_

- `supabase/functions/_shared/mcp/`: catálogo completo de tools, validação Zod-like
  de parâmetros, formatação de resposta com metadados de proveniência, glossário
  como resource, prompts prontos.
- Testes Vitest com fixtures para cada tool (contrato de entrada/saída), mais um
  teste de regressão que compara `get_dre` com o resultado da RPC direta.
- **Pronto quando:** `bun run preflight` verde e o catálogo inteiro roda por stdio.

### Fase 2 — Schema `mcp_api` e sandbox SQL · _média_

- Migration com o schema, as views `security_invoker`, o role `mcp_ro` e
  `mcp_query_log`.
- `sql_query` com todas as travas do §4.3 e testes de que cada trava dispara
  (escrita bloqueada, timeout, limite de linhas, schema fora de alcance).
- **Pronto quando:** `db:reset` do zero aplica tudo e as travas têm teste.

### Fase 3 — Transporte HTTP + token pessoal · _média_

- Edge Function servindo MCP sobre Streamable HTTP, `verify_jwt = false` na config
  (a própria função valida o token contra `mcp_tokens`), CORS, rate limit.
- UI mínima em `/integracoes` para emitir e revogar token.
- **Pronto quando:** Claude Code remoto e um agente n8n consultam com token próprio,
  e revogar o token derruba o acesso na hora.

### Fase 4 — OAuth 2.1 e connector · _média_ (era grande; o Supabase encolheu)

- Habilitar `[auth.oauth_server]` local, depois no remoto.
- Migration da blindagem de escrita (`client_id is null`) + `mcp_clients`, com teste de
  que a escrita por token OAuth falha.
- Rota `/oauth/consent` no SPA: detalhes da autorização, empresas e módulos em português
  claro, aprovar/negar.
- Resource server: `/.well-known/oauth-protected-resource`, 401 com `WWW-Authenticate`,
  validação por JWKS.
- Connector publicado; convite a sócios e contador, cada um com o próprio escopo.
- **Pronto quando:** o contador entra com o login dele no claude.ai, enxerga fiscal e
  financeiro, **não** enxerga folha, e uma tentativa de escrita pelo token dele é
  recusada pelo banco — os três comprovados por teste.

### Fase 5 — Operação · _pequena_

- Mascaramento auditado tool a tool, retenção do log, alerta de volume anômalo,
  painel simples de uso em `/integracoes`.
- Documento irmão `mcp-insights-system.md` com a referência técnica final.

---

### Como rodar o servidor local hoje

O transporte stdio já existe (`scripts/mcp-stdio.ts`, `bun run mcp:stdio`). Ele
autentica com o **seu login da plataforma** — anon key + sessão de usuário, nunca
service role — de modo que a RLS decide o que aparece. Registro no Claude Code:

```sh
claude mcp add otm-financeiro --env MCP_SUPABASE_URL=... --env MCP_SUPABASE_ANON_KEY=... --env MCP_SUPABASE_EMAIL=... --env MCP_SUPABASE_PASSWORD=... -- bun run /caminho/absoluto/scripts/mcp-stdio.ts
```

As credenciais ficam na configuração do cliente MCP, **nunca em arquivo do
repositório**. O servidor sobe e anuncia as tools sem tocar na rede; o login só
acontece na primeira chamada de tool, e uma falha de credencial volta como erro
legível em vez de derrubar o processo.

## 9. Perguntas em aberto

- **S1 — ~~O Supabase Auth virou authorization server OAuth 2.1?~~ RESOLVIDO em
  31/08/2026: sim, nativo, compatível com o spec de auth do MCP, com DCR e JWKS.**
  A Fase 4 deixou de ser "escrever um AS" e virou "configurar o AS + uma página de
  consentimento". Ver §4.4. Ressalva: ainda em beta e **sem escopos** — daí a blindagem
  por `client_id`.
- **S1b — Validar a blindagem no local.** Confirmar que um JWT com `client_id` de fato
  recebe `42501` em INSERT/UPDATE/DELETE após a migration, e que a leitura continua
  intacta para o mesmo usuário. É o teste que sustenta a invariante nº 5.
- **S2 — Requisitos correntes de connector** no claude.ai e no ChatGPT (tools
  `search`/`fetch`, limites de payload, timeouts).
- **S3 — Quanto contexto cabe?** `describe_data` com plano de contas inteiro pode
  estourar o orçamento de tokens. Medir e, se preciso, paginar/resumir.
- **S4 — Custo por pergunta.** Uma análise de 6 meses pode disparar dezenas de
  chamadas. Medir no protótipo e calibrar as tools compostas.

### Fontes (consultadas em 31/08/2026)

- [OAuth 2.1 Server — Supabase Docs](https://supabase.com/docs/guides/auth/oauth-server)
- [Getting Started with OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [MCP Authentication — Supabase Docs](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Changelog: OAuth 2.1 Server Capabilities](https://supabase.com/changelog/38022-oauth-2-1-server-capabilities-for-supabase-auth)
- [Discussão #38022 — status e limitações](https://github.com/orgs/supabase/discussions/38022)

## 10. O que fica de fora, deliberadamente

- **RAG / índice vetorial dos dados.** Dado financeiro muda a cada sync do pagar.me;
  consulta ao vivo é mais simples e sempre correta.
- **Qualquer escrita**, incluindo "criar lançamento a partir da conversa".
- **Cache de resultado entre usuários** — quebraria o isolamento de RLS.
- **Tool que busca URL externa** — fecha a porta para exfiltração via injeção de
  prompt em descrição de lançamento.
