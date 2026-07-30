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

## Git workflow

Seguimos **GitHub Flow** — `main` é a única branch permanente e está sempre
deployável.

```
main      ●───●───●───●───●   ← sempre verde, sempre deployável
            ↑   ↑   ↑   ↑
feat       ●   ●   ●   ●     ← branches curtas, mergeadas via PR
```

### Regras

1. **Nunca commitar direto na `main`.** Toda mudança passa por PR.
2. **Branch por feature/fix:** `feat/<slug>`, `fix/<slug>`, `chore/<slug>`,
   `refactor/<slug>`, `docs/<slug>`. Use kebab-case.
3. **Branch curta:** o objetivo é mergear em 1–3 dias. Se ficou maior, quebre
   em PRs menores.
4. **PR só faz merge com CI verde** — typecheck, lint, format, tests, build.
5. **Conventional Commits** obrigatório no título do PR e nos commits
   (hook `commit-msg` enforça localmente).
6. **Squash merge** preferido: histórico da `main` fica linear e legível.
7. **Deletar branch após merge.** GitHub faz isso automaticamente se ativar
   "Automatically delete head branches".

### Fluxo prático

```sh
# Atualizar main e criar branch
git checkout main
git pull
git checkout -b feat/transaction-form-drawer

# Desenvolver, commitando localmente (hooks rodam preflight nos arquivos staged)
git add -p
git commit -m "feat(transactions): drawer skeleton with RHF + Zod"

# Push e abrir PR
git push -u origin feat/transaction-form-drawer
# (depois pelo navegador: abrir PR no GitHub, esperar CI, mergear via squash)
```

### Branch protection na `main` (configurar 1 vez no GitHub)

Em `Settings → Branches → Add rule` para `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - Selecionar o check `Quality gates` do workflow `CI`
- ✅ Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings
- (Opcional) Require signed commits — se o time todo tiver GPG configurado

Em `Settings → General → Pull Requests`:

- ✅ Allow squash merging (default)
- ❌ Allow merge commits (desligar para forçar squash)
- ✅ Automatically delete head branches

### Ambientes

- **Produção:** deploy manual via Cloudflare Pages (você dispara).
- **Preview por PR (futuro):** Cloudflare Pages cria URL automática para cada
  PR — bom para o financeiro validar antes de aprovar. Configurável na
  integração GitHub ↔ Cloudflare.

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

Configuração no dashboard do Pages (a build é estática, sem Pages Functions):

1. Build command: `bun install --frozen-lockfile && bun run build`
2. Build output: `dist`
3. Env vars (Production **e** Preview):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `BUN_VERSION` = a mesma versão do dev/CI (hoje `1.3.13`)
   - `SKIP_DEPENDENCY_INSTALL` = `1`
4. SPA fallback já configurado em [public/\_redirects](public/_redirects)

### ⚠️ Não adicione `wrangler.toml` a este projeto

Com um Wrangler config no repo, **o arquivo passa a ser a fonte da verdade** e a
configuração do dashboard vira somente-leitura — inclusive as variáveis de
build. O log do Pages mostra o efeito:

```
Found wrangler.toml file. Reading build configuration...
Build environment variables: (none found)
```

As variáveis salvas no dashboard param de chegar ao build. Como este projeto é
SPA estática (sem `functions/`), o `wrangler.toml` só declarava
`pages_build_output_dir`, que o dashboard já tem — e em troca engolia as
variáveis. Foi removido em 30/07/2026.

Se algum dia entrarem Pages Functions e o arquivo voltar, as variáveis de build
têm de ir para dentro dele; o dashboard deixará de valer.

### Por que `SKIP_DEPENDENCY_INSTALL`

O Pages detecta o gerenciador de pacotes pelo lockfile e **não reconhece o
`bun.lock` em texto** (bun ≥ 1.2) — só o antigo `bun.lockb`. Sem isso ele roda
`npm install` **antes** do build command, com o npm que vem no Node da imagem —
o build command com bun nem chega a executar. Em 30/07/2026 esse fallback
quebrou o deploy: `npm error Cannot read properties of null (reading
'edgesOut')` — bug do arborist do npm 10.9.2, que não acontece no npm 11 nem no
bun, com o mesmo `package.json`. Nada havia mudado no repo; o npm apenas passou
a engasgar com a árvore de dependências.

`SKIP_DEPENDENCY_INSTALL=1` desliga a instalação automática; quem instala é o
build command, com bun e o mesmo lockfile do CI e do dev. Uma só cadeia de
dependências nos três lugares — o npm sai do circuito.

Se alguém remover essa variável, o fallback npm volta e o deploy quebra de
novo. O paliativo, nesse caso, é `NODE_VERSION` ≥ 24 (que traz npm 11); a
correção é recolocar o `SKIP_DEPENDENCY_INSTALL`.

## Roadmap

- [x] Fase 0 — Fundação (stack, tokens, AppShell, auth)
- [ ] Fase 1 — Núcleo de lançamento (CRUD transactions, plano de contas UI)
- [ ] Fase 2 — Visualização (Dashboard com dados reais, DRE, fluxo de caixa)
- [ ] Fase 3 — Produtividade (import CSV, recorrências, conciliação)
- [ ] Fase 4 — Folha (cadastro de colaboradores, geração mensal)
- [ ] Fase 5 — Polimento (auditoria UI, exports PDF/Excel, drill-down)
