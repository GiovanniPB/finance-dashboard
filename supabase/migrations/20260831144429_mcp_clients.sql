-- =============================================================================
-- mcp_clients — quais conectores de IA podem usar o servidor MCP
--
-- POR QUE EXISTE. Com registro dinâmico ligado no remoto (o claude.ai precisa
-- dele), qualquer cliente MCP consegue se registrar sozinho no nosso authorization
-- server. O consentimento do usuário ainda é obrigatório, mas "o usuário clicou
-- aprovar" é uma barreira frágil contra um cliente que ninguém revisou. Esta tabela
-- é a lista do que a CASA autoriza, independente do que o usuário aprova.
--
-- O QUE ELA AINDA NÃO FAZ. As colunas `company_ids` e `modules` estão aqui para o
-- passo seguinte — estreitar o escopo de um conector para menos do que o próprio
-- usuário enxerga. Impor isso exige policy restritiva de SELECT em toda tabela
-- company-scoped, com o cuidado de performance da convenção de RLS (InitPlan), e
-- merece migration própria. Por ora as colunas ficam nulas e não são consultadas:
-- **um conector autorizado enxerga exatamente o que o usuário enxerga.**
--
-- A imposição de hoje é no Worker, que consulta esta tabela a cada requisição e
-- recusa com 403 o `client_id` ausente ou inativo.
-- =============================================================================

create table if not exists public.mcp_clients (
  -- `client_id` do OAuth Server do Supabase (uuid, mas guardado como texto porque é
  -- assim que chega na claim do JWT).
  client_id   text primary key,
  nome        text not null,
  ativo       boolean not null default true,
  -- null = todas as empresas do usuário. Reservado (ver acima).
  company_ids uuid[],
  -- null = todos os módulos do usuário. Reservado (ver acima).
  modules     public.data_module[],
  observacao  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

comment on table public.mcp_clients is
  'Conectores de IA autorizados a usar o servidor MCP. O Worker consulta a cada requisição; client_id ausente ou inativo recebe 403.';

create trigger trg_mcp_clients_updated before update on public.mcp_clients
  for each row execute function set_updated_at();

alter table public.mcp_clients enable row level security;

-- Leitura: qualquer usuário autenticado precisa poder conferir se o conector que
-- está usando é permitido — inclusive (e principalmente) quando o token é de OAuth,
-- porque é exatamente esse caminho que a checagem protege. Não há dado sensível
-- aqui: é o nome de um aplicativo.
create policy "mcp_clients_sel" on public.mcp_clients
  for select to authenticated
  using (true);

-- Escrita: só super admin, e só pelo aplicativo (o trio de blindagem abaixo já
-- recusa qualquer token de OAuth, mas ser explícito aqui é barato).
create policy "mcp_clients_ins" on public.mcp_clients
  for insert to authenticated with check ((select public.is_super_admin()));
create policy "mcp_clients_upd" on public.mcp_clients
  for update to authenticated using ((select public.is_super_admin()));
create policy "mcp_clients_del" on public.mcp_clients
  for delete to authenticated using ((select public.is_super_admin()));

-- Tabela nova precisa do trio que impede escrita por token de OAuth (convenção do
-- CLAUDE.md, migration `..._mcp_oauth_sem_escrita`).
create policy oauth_sem_escrita_ins on public.mcp_clients
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.mcp_clients
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.mcp_clients
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

grant select on public.mcp_clients to authenticated;

-- -----------------------------------------------------------------------------
-- A trilha de uso passa a registrar QUAL conector fez a chamada.
-- -----------------------------------------------------------------------------
alter table public.mcp_query_log add column if not exists client_id text;

comment on column public.mcp_query_log.client_id is
  'client_id do conector (claim do JWT de OAuth). Null quando a chamada veio de uma sessão comum do aplicativo.';

create index if not exists idx_mcp_log_client on public.mcp_query_log (client_id, created_at desc);
