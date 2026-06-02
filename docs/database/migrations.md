# Workflow de migrations (Supabase)

> Fonte da verdade: **arquivos SQL versionados em `supabase/migrations/`**.
> Projeto remoto: `vbeevkjenvgvnattzszt` ("Finance Dashboard", `sa-east-1`, Postgres 17).
> Toda mudança de schema é um arquivo SQL revisado em PR e aplicado com `db push`.

## Setup (uma vez por máquina)

```sh
# 1. Login (abre o navegador)
supabase login

# 2. Linkar o repositório ao projeto remoto (já feito neste repo)
supabase link --project-ref vbeevkjenvgvnattzszt

# 3. Docker rodando (para a stack local)
#    Docker Desktop / OrbStack ativo
```

## Baseline (uma vez, no início)

Captura o schema atual do remoto como migration inicial, para o git refletir 100% do banco:

```sh
bun run db:pull        # supabase db pull  → pede a senha do banco
git add supabase/migrations
git commit -m "chore(db): baseline do schema remoto"
```

> A **senha do banco** está em Supabase Dashboard → Project Settings → Database → Connection string / Reset password. Não commite a senha; o CLI a usa só localmente.

## Ciclo de desenvolvimento (toda mudança de schema)

```sh
# 1. Criar uma migration vazia com nome descritivo
bun run db:new nfse_schema          # cria supabase/migrations/<ts>_nfse_schema.sql

# 2. Escrever o SQL no arquivo gerado (revisável no PR)

# 3. Testar LOCALMENTE primeiro (nunca direto no remoto)
bun run db:start                    # sobe Postgres+Auth+Storage+Functions local
bun run db:reset                    # recria o banco local aplicando TODAS as migrations
#   → valida que a migration roda limpa do zero

# 4. Regenerar tipos a partir do banco local
bun run db:types:local

# 5. Rodar testes
bun run test:run

# 6. Aplicar no remoto só após review/merge
bun run db:push                     # aplica migrations pendentes no projeto linkado
bun run supabase:types              # regenera tipos do remoto
```

## Scripts disponíveis

| Script                 | Comando                  | Uso                                                                  |
| ---------------------- | ------------------------ | -------------------------------------------------------------------- |
| `db:start` / `db:stop` | `supabase start/stop`    | Stack local (Docker)                                                 |
| `db:status`            | `supabase status`        | URLs/portas/chaves locais                                            |
| `db:new <nome>`        | `supabase migration new` | Nova migration vazia                                                 |
| `db:diff <nome>`       | `supabase db diff -f`    | Gera migration a partir de alterações feitas no banco local          |
| `db:reset`             | `supabase db reset`      | Recria o banco **local** do zero (aplica todas as migrations + seed) |
| `db:pull`              | `supabase db pull`       | Importa schema do remoto (baseline/reconciliação)                    |
| `db:push`              | `supabase db push`       | Aplica migrations pendentes no **remoto**                            |
| `db:lint`              | `supabase db lint`       | Lint de SQL                                                          |
| `supabase:types`       | gen types (remoto)       | Atualiza `src/types/database.ts` do remoto                           |
| `db:types:local`       | gen types (local)        | Atualiza tipos a partir da stack local                               |

## Regras do time

1. **Nunca** alterar o schema direto pelo dashboard/SQL editor do remoto sem uma migration correspondente — isso causa drift entre git e banco.
2. **Sempre** testar a migration com `db:reset` local antes de `db:push`.
3. Migrations são **imutáveis** depois de aplicadas no remoto/mergeadas — corrija com uma nova migration, nunca editando uma já aplicada.
4. Um arquivo de migration por mudança coesa, com nome descritivo (`nfse_schema`, `nfse_rls_policies`, ...).
5. Regenerar `src/types/database.ts` no mesmo PR da migration.
6. **RLS desde o primeiro dia** em qualquer tabela nova (padrão do projeto).

## DB Branching (opcional, para mudanças arriscadas)

Para PRs que mexem em schema crítico, dá para usar branches de banco do Supabase
(isolam a mudança num banco efêmero por PR). Requer plano pago e integração GitHub.
Avaliar caso a caso; para o desenvolvimento do dia a dia, a stack local já cobre.

## `.gitignore`

`supabase/.gitignore` (gerado pelo `init`) já ignora `.branches` e `.temp`
(estado de link/local, específico de máquina). **Versionar**: `config.toml`,
`migrations/`, `seed.sql` (se houver), `functions/`.

## Política de dados de seed (importante)

**Dados de demonstração/negócio NÃO devem entrar em migrations.** Migrations são
schema + dados de referência agnósticos de ambiente. Dados de exemplo (transações,
funcionários, etc.) vão em `supabase/seed.sql` (roda só localmente, após as
migrations, no `db reset`). Misturar dado em migration quebra o `db reset` do zero
e amarra a reprodução a registros específicos (ex.: um `auth.users` que só existe
no remoto).

## Histórico: como o repositório adotou as migrations (jun/2026)

O projeto remoto foi construído via MCP `apply_migration`, que aplicou 51 migrations
e gravou o SQL em `supabase_migrations.schema_migrations`, mas **nunca escreveu os
arquivos no git**. Para adotar sem perder histórico:

1. `supabase init` + `supabase link --project-ref vbeevkjenvgvnattzszt`.
2. Recuperação lossless dos 51 arquivos via [`../../supabase/recover-migrations.sh`](../../supabase/recover-migrations.sh),
   que lê `schema_migrations.statements` e materializa `migrations/<version>_<name>.sql`.
   (Read-only no remoto, sem squash, sem `migration repair`.)
3. **Ajuste de portabilidade:** os 5 `seed_txns_batch_*` referenciavam um `auth.users`
   hardcoded que só existe no remoto → trocado por
   `(select id from auth.users order by created_at limit 1)` (coluna `created_by` é
   nullable). Local roda do zero; no remoto essas migrations não re-executam.
   Esses seeds são dado-demo e, idealmente, migrariam para `seed.sql` no futuro.
4. Validado com `bun run db:reset` (51/51 aplicadas, 487 transações seedadas).
