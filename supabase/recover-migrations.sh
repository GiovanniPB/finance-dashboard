#!/usr/bin/env bash
#
# Recupera os arquivos de migration a partir do histórico remoto do Supabase.
# As migrations foram aplicadas via MCP (apply_migration), que grava o SQL
# completo em supabase_migrations.schema_migrations.statements. Este script
# materializa cada uma como supabase/migrations/<version>_<name>.sql, de forma
# lossless — o local passa a bater 1:1 com o remoto, sem squash.
#
# Uso:
#   SUPABASE_DB_PASSWORD='sua_senha' bash supabase/recover-migrations.sh
#   (ou rode sem a env var e o script pedirá a senha)
#
# A senha está em: Supabase Dashboard → Project Settings → Database → Password.
# Ela NÃO é gravada em lugar nenhum; é usada só nesta conexão.

set -euo pipefail

PROJECT_REF="vbeevkjenvgvnattzszt"
PGHOST_="aws-1-sa-east-1.pooler.supabase.com"
PGPORT_="5432"
PGUSER_="postgres.${PROJECT_REF}"
PGDB_="postgres"

# raiz do repo
cd "$(git rev-parse --show-toplevel)"

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  read -rsp "Senha do banco (Supabase → Settings → Database): " SUPABASE_DB_PASSWORD
  echo
fi
export PGPASSWORD="$SUPABASE_DB_PASSWORD"

CONN="host=${PGHOST_} port=${PGPORT_} dbname=${PGDB_} user=${PGUSER_} sslmode=require"

# sanity check de conexão
if ! psql "$CONN" -At -c "select 1" >/dev/null 2>&1; then
  echo "ERRO: não consegui conectar. Confira a senha e a rede." >&2
  exit 1
fi

mkdir -p supabase/migrations

count=0
# lista versão|nome ordenada cronologicamente
while IFS='|' read -r version name; do
  [ -z "$version" ] && continue
  out="supabase/migrations/${version}_${name}.sql"
  psql "$CONN" -At -c \
    "select array_to_string(statements, E'\n') from supabase_migrations.schema_migrations where version = '${version}'" \
    > "$out"
  count=$((count + 1))
  printf '✓ %s\n' "$out"
done < <(psql "$CONN" -At -F '|' -c \
  "select version, name from supabase_migrations.schema_migrations order by version")

echo ""
echo "Recuperadas ${count} migrations em supabase/migrations/"
echo ""
echo "Próximos passos:"
echo "  1. supabase migration list      # local e remoto devem bater 1:1"
echo "  2. bun run db:start && bun run db:reset   # valida que rodam do zero (precisa Docker)"
echo "  3. git add supabase && git commit -m 'chore(db): recupera histórico de migrations do remoto'"
