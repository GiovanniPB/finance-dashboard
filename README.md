# Finance Dashboard · OTM Group

Dashboard financeiro consolidado para o grupo OTM (Holding, Assessoria, Corretora, RCO Tecnologia).
Permite imputar receita, despesas e folha; gera DRE, fluxo de caixa, KPIs e visão consolidada.

## Stack

| Camada  | Tecnologia                                                      |
| ------- | --------------------------------------------------------------- |
| Build   | Vite 6 + React 19 + TypeScript                                  |
| Routing | React Router v7 (SPA)                                           |
| Styling | Tailwind CSS v4 + tokens próprios (Bento Financeiro)            |
| UI      | shadcn-style primitives + Radix UI + Lucide icons               |
| State   | TanStack Query (server) + Zustand (client, futuro) + nuqs (URL) |
| Forms   | React Hook Form + Zod                                           |
| Charts  | Recharts                                                        |
| Tables  | TanStack Table                                                  |
| Money   | Dinero.js (operações) + `numeric(18,2)` no Postgres             |
| Datas   | date-fns + ptBR                                                 |
| Backend | Supabase (Postgres 17 + Auth + RLS + Storage)                   |
| Hosting | Cloudflare Pages (static SPA)                                   |

## Setup

```sh
# Pré-requisitos: Bun ou Node 22+
cp .env.example .env   # credenciais do Supabase já preenchidas
bun install
bun run dev            # http://localhost:5173
```

## Scripts

| Comando                  | O que faz                                         |
| ------------------------ | ------------------------------------------------- |
| `bun run dev`            | Servidor de desenvolvimento (Vite)                |
| `bun run build`          | Build de produção em `dist/`                      |
| `bun run preview`        | Preview do build                                  |
| `bun run typecheck`      | TypeScript em modo `--noEmit`                     |
| `bun run lint`           | ESLint (regras type-aware estritas)               |
| `bun run lint:fix`       | ESLint com auto-fix                               |
| `bun run format`         | Prettier --write                                  |
| `bun run format:check`   | Prettier --check (CI)                             |
| `bun run test`           | Vitest em modo watch                              |
| `bun run test:run`       | Vitest single-run                                 |
| `bun run test:coverage`  | Cobertura V8 (threshold 60%)                      |
| `bun run preflight`      | typecheck + lint + format:check + test (mesmo CI) |
| `bun run supabase:types` | Regenera `src/types/database.ts`                  |

## Qualidade

- **Prettier** com `prettier-plugin-tailwindcss` (sort de classes Tailwind) e
  `@ianvs/prettier-plugin-sort-imports` (ordenação de imports).
- **ESLint** com `tseslint.configs.strictTypeChecked` + `stylisticTypeChecked`
  (regras type-aware). Plugins: `import`, `jsx-a11y`, `unicorn` (subset pragmático).
- **EditorConfig** para consistência entre editores.
- **Husky** com hooks:
  - `pre-commit` → lint-staged (Prettier + `eslint --fix --max-warnings=0` nos arquivos staged)
  - `pre-push` → typecheck + tests
  - `commit-msg` → Conventional Commits (`feat|fix|refactor|perf|docs|test|chore|ci|build|style|revert`)
- **Vitest** + Testing Library + happy-dom; setup em [src/test/setup.ts](src/test/setup.ts).
- **GitHub Actions** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) roda
  typecheck → lint → format:check → test → build em PRs e pushes para `main`.

## Estrutura

```
src/
├── components/
│   ├── ui/              # primitives shadcn-style
│   ├── layout/          # AppShell, Sidebar, Topbar, CompanySwitcher
│   └── theme-provider.tsx
├── features/            # domínio (auth, companies, transactions, dre, ...)
│   ├── auth/
│   └── companies/
├── lib/                 # supabase client, queryClient, money, dates, format, cn
├── routes/              # páginas de rota
├── styles/              # tokens.css + globals.css
├── types/               # database.ts gerado do Supabase
├── App.tsx              # router + providers
└── main.tsx
```

Organização **por feature**, não por tipo de arquivo. Cada feature contém
`api.ts`, `hooks.ts`, `components/` e tipos próprios.

## Backend (Supabase)

Projeto: `vbeevkjenvgvnattzszt` · `sa-east-1` · Postgres 17

**Tabelas core:**

- `organizations`, `companies`, `profiles`
- `chart_of_accounts_master` (72 contas) + `chart_of_accounts` (por empresa)
- `cost_centers` (Comercial / Administrativo / Geral)
- `bank_accounts` + `cash_balance_snapshots`
- `transactions` (com `accrual_date` competência + `cash_date` caixa)
- `recurring_templates`
- `employees`, `payroll_runs`, `payroll_items`
- `import_batches`, `import_rows`
- `audit_log` (trigger genérico)

**RPCs:**

- `dre_by_company(uuid, date, date)`
- `dre_consolidated(uuid, date, date)`
- `cashflow_daily(uuid, date, date)`
- `cashflow_monthly(uuid, int)`
- `kpi_dashboard(uuid, int)` — replica os cards do dashboard
- `bank_balances(uuid, date)`

**Segurança:** RLS habilitado em todas as tabelas. Acesso liberado a qualquer
usuário com `profile` (modelo simples; granularidade futura via roles).

## Design tokens

Direção: **Bento Financeiro moderno** — paleta neutra fria, acento violeta,
tipografia editorial (Geist display + Inter UI + JetBrains Mono para números
com tabular figures), suporte light/dark.

Todos os tokens em [src/styles/tokens.css](src/styles/tokens.css). Bridge para
Tailwind em [src/styles/globals.css](src/styles/globals.css) via `@theme inline`.

## Deploy (Cloudflare Pages)

1. Conectar repositório no Cloudflare Pages
2. Build command: `bun run build`
3. Build output: `dist`
4. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
5. SPA fallback já configurado em [public/\_redirects](public/_redirects)

## Roadmap

- [x] Fase 0 — Fundação (stack, tokens, AppShell, auth)
- [ ] Fase 1 — Núcleo de lançamento (CRUD transactions, plano de contas UI)
- [ ] Fase 2 — Visualização (Dashboard com dados reais, DRE, fluxo de caixa)
- [ ] Fase 3 — Produtividade (import CSV, recorrências, conciliação)
- [ ] Fase 4 — Folha (cadastro de colaboradores, geração mensal)
- [ ] Fase 5 — Polimento (auditoria UI, exports PDF/Excel, drill-down)
