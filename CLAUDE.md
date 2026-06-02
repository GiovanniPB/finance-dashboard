# CLAUDE.md — Finance Dashboard · OTM Group

Contexto e convenções deste projeto para agentes de IA e devs. Leia antes de mexer no código.

## O que é

Dashboard financeiro consolidado do **grupo OTM** (Holding, Assessoria, Corretora, RCO Tecnologia).
Substitui a planilha de DRE: imputa receita, despesas e folha; gera **DRE, fluxo de caixa, KPIs e visão consolidada** multi-empresa. Em evolução: **emissão de NFS-e** a partir de vendas do pagar.me (ver `docs/integrations/`).

## Stack

| Camada   | Tecnologia                                                      |
| -------- | --------------------------------------------------------------- |
| Build    | Vite 6 + React 19 + TypeScript · **bun** (runtime/pm)           |
| Routing  | React Router v7 (SPA)                                           |
| Styling  | Tailwind CSS v4 + tokens próprios (direção "Bento Financeiro")  |
| UI       | shadcn-style primitives + Radix UI + Lucide                     |
| State    | TanStack Query (server) · nuqs (URL) · Zustand (client, futuro) |
| Forms    | React Hook Form + Zod                                           |
| Tabelas  | TanStack Table · Charts: Recharts                               |
| Dinheiro | Dinero.js (operações) + `numeric(18,2)` no Postgres             |
| Datas    | date-fns + ptBR                                                 |
| Backend  | **Supabase** (Postgres 17 + Auth + RLS + Storage) · `sa-east-1` |
| Deploy   | **Cloudflare Pages** (estático)                                 |

Projeto Supabase: `vbeevkjenvgvnattzszt` ("Finance Dashboard").

## Comandos

```sh
bun run dev            # Vite dev server
bun run build          # tsc -b && vite build
bun run preflight      # typecheck + lint + format:check + test  (rode antes de PR)
bun run test:run       # vitest (uma vez)
bun run lint:fix       # eslint --fix
# Banco (Supabase) — ver docs/database/migrations.md
bun run db:start       # stack local (Docker)
bun run db:reset       # recria banco local do zero (aplica todas as migrations + seed)
bun run db:new <nome>  # nova migration vazia
bun run db:push        # aplica migrations pendentes no remoto (só após PR)
bun run db:types:local # regenera src/types/database.ts do banco local
```

## Estrutura

```
src/
├── components/
│   ├── ui/            # primitives shadcn-style (Radix)
│   └── layout/        # AppShell, Sidebar, Topbar, CompanySwitcher
├── features/          # domínio: cada feature tem api.ts, hooks.ts, schema.ts, components/
│   ├── companies/ transactions/ bills/ taxes/ recurring/ employees/ ...
├── lib/               # supabase client, queryClient, money, dates, format, cn
├── routes/            # páginas de rota
├── styles/            # tokens.css + globals.css (Tailwind v4 @theme inline)
└── types/             # database.ts (gerado do Supabase — NÃO editar à mão)
supabase/
├── migrations/        # fonte da verdade do schema (versionado)
└── config.toml
docs/
├── database/migrations.md             # workflow de migrations
└── integrations/                      # NFS-e (Focus × pagar.me): arquitetura + plano
```

**Organização por feature, não por tipo de arquivo.** Arquivos pequenos e coesos (200–400 linhas; máx. 800).

## Banco de dados & migrations

> Detalhes completos em [`docs/database/migrations.md`](docs/database/migrations.md).

- **Fonte da verdade = arquivos em `supabase/migrations/`.** Toda mudança de schema é uma migration revisada em PR.
- **Nunca** alterar o schema direto pelo dashboard/SQL editor do remoto sem migration (causa drift).
- **Sempre** testar com `bun run db:reset` (local, do zero) antes de `bun run db:push`.
- Migrations são **imutáveis** após aplicadas/mergeadas — corrija com uma nova, nunca editando uma antiga.
- **Dados de demo/negócio NÃO vão em migration** → `supabase/seed.sql` (local). Migration = schema + dados de referência agnósticos de ambiente.
- Regenerar `src/types/database.ts` no mesmo PR da migration.

### Convenções de schema (siga os padrões existentes)

- snake_case; PK `uuid default gen_random_uuid()`; `created_at`/`updated_at timestamptz`; `metadata jsonb default '{}'`.
- Dinheiro: **`numeric(18,2)`** (nunca float). No app, Dinero.js.
- Enums Postgres para estados de domínio (ex.: `transaction_status`, `invoice_job_status`).
- Trigger de timestamp: `create trigger trg_<t>_updated before update on <t> for each row execute function set_updated_at();`
- Auditoria: `create trigger trg_audit_<t> after insert or update or delete on <t> for each row execute function audit_record();` (grava em `audit_log`, usa `auth.uid()`).

### RLS (obrigatório desde o primeiro dia em toda tabela nova)

Helpers existentes: `is_super_admin()`, `has_company_access(uuid)`, `is_financial_user()`.
Padrão para tabela company-scoped:

```sql
alter table public.<t> enable row level security;
create policy "<t>_scoped" on public.<t>
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));
```

- Acesso é por `company_access` (usuário ↔ empresa). Super admin bypassa.
- Tabelas de ingest/segredo: política restrita a `is_super_admin()`; escrita pelas Edge Functions usa **service role** (bypassa RLS).

## Padrões de código

- **Imutabilidade:** crie objetos novos, não mute existentes.
- **KISS / YAGNI / DRY.** Simplicidade sobre esperteza; não abstraia antes da hora.
- Validação em fronteiras com **Zod**; trate erros explicitamente (nada de erro engolido).
- Naming: `camelCase` (vars/fns), `PascalCase` (componentes/tipos), `UPPER_SNAKE_CASE` (constantes), hooks com prefixo `use`.
- Server state via **TanStack Query** (não duplicar em store client). Estado compartilhável (filtros, paginação, aba) na **URL** via nuqs.
- Frontend **só** fala com o Supabase via anon key + RLS. **Nunca** colocar segredo (pagar.me/Focus/service role) no front.

## Testes

- **Vitest.** TDD quando fizer sentido; AAA (Arrange-Act-Assert); nomes descritivos do comportamento.
- Alvo de cobertura: **80%+** em lógica/utilitários/hooks.
- Para a esteira NFS-e: testes de integração com **fixtures** (sem chamar terceiros) são a primeira linha (ver plano, Camada 0).

## Git & PR

- **Conventional commits**: `feat|fix|refactor|docs|test|chore|perf|ci(escopo): descrição`.
- **Sem atribuição/co-author** nas mensagens de commit (preferência do dono do repo).
- Uma branch por mudança coesa; PR com squash merge; `main` protegida (CI "Quality gates" obrigatório).
- Husky + lint-staged rodam prettier/eslint nos arquivos staged no commit. Rode `bun run preflight` antes de abrir PR.

## Segurança

- Segredos em **Supabase Vault** (ou env do servidor), nunca no código/front.
- Validar entrada; queries parametrizadas; RLS em tudo; mensagens de erro sem vazar dado sensível.
- LGPD: guardar só o PII necessário (ex.: snapshot mínimo do tomador na NFS-e).

## ⚠️ Não faça

- **Não fazer deploy** — o Cloudflare Pages é operado pelo dono do repo.
- **Não** aplicar migration direto no remoto sem testar local + PR.
- **Não** editar `src/types/database.ts` à mão (é gerado).
- **Não** colocar dado de seed em migration nem segredo no frontend.
- **Não** mutar dados de migrations já aplicadas.

## Trabalho ativo: integração NFS-e

Emissão de NFS-e municipal (Barueri) a partir de assinaturas do pagar.me, com **split** entre empresas
(`1 charge.paid → N NFS-e`). Arquitetura Supabase-nativa (Edge Functions + fila por status na `invoice_jobs`).
Ver [`docs/integrations/nfse-pagarme-architecture.md`](docs/integrations/nfse-pagarme-architecture.md) e
[`docs/integrations/nfse-implementation-plan.md`](docs/integrations/nfse-implementation-plan.md).
Referências das APIs: `focusnfe.md` e `pagarme.md` (raiz).
