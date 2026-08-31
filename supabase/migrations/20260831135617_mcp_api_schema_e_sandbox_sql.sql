-- =============================================================================
-- MCP de insights — schema `mcp_api` (superfície de leitura para IA) + sandbox SQL
--
-- CONTEXTO. O servidor MCP expõe o financeiro a uma IA em linguagem natural. As
-- tools semânticas cobrem a pergunta previsível (DRE, caixa, busca de lançamento);
-- esta migration cobre a IMPREVISÍVEL, dando ao modelo um SELECT livre — mas
-- dentro de uma jaula.
--
-- A jaula tem quatro paredes, e nenhuma delas é "o servidor promete que só lê":
--
-- 1. **Schema separado.** Só views, aqui. O `search_path` da função de execução é
--    `mcp_api, pg_temp` — sem `public`. `select * from transactions` não resolve;
--    `select * from transacoes` sim. Nome de tabela do app não é alcançável.
-- 2. **`security_invoker = true`** em toda view: a RLS do usuário continua valendo,
--    e ninguém enxerga por SQL o que não enxergaria na tela.
-- 3. **Função STABLE.** O Postgres recusa qualquer statement que modifique dados
--    dentro de uma função não-volátil, inclusive por EXECUTE dinâmico. A trava é
--    do executor, não da nossa regex.
-- 4. **Validação de texto** como defesa em profundidade: uma instrução, sem
--    comentário, começando por SELECT/WITH, sem palavra de escrita, sem outro
--    schema, com LIMIT imposto por fora e statement_timeout curto.
--
-- As views também são DOCUMENTAÇÃO EXECUTÁVEL: colunas como `entra_em_competencia`
-- e `e_transferencia` põem a semântica contábil onde o modelo não tem como errar,
-- em vez de esperar que ele lembre da regra.
-- =============================================================================

create schema if not exists mcp_api;

comment on schema mcp_api is
  'Superfície de leitura do servidor MCP. Só views security_invoker (a RLS do usuário vale) e a função run_query. Nada aqui escreve.';

-- -----------------------------------------------------------------------------
-- Mascaramento de PII
-- -----------------------------------------------------------------------------

-- CPF é PII e não tem serventia analítica -> mascarado. CNPJ é dado público de
-- pessoa jurídica e é justamente o que identifica um fornecedor numa análise ->
-- passa formatado. Mesma regra do núcleo TypeScript (`format.ts`), aqui em SQL
-- porque o SQL livre não passa por lá.
create or replace function mcp_api.mask_cpf(p_doc text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_doc is null or btrim(p_doc) = '' then null
    when length(regexp_replace(p_doc, '\D', '', 'g')) = 14 then
      regexp_replace(regexp_replace(p_doc, '\D', '', 'g'),
        '(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})', '\1.\2.\3/\4-\5')
    when length(regexp_replace(p_doc, '\D', '', 'g')) = 11 then
      '***.' || substr(regexp_replace(p_doc, '\D', '', 'g'), 4, 3)
      || '.' || substr(regexp_replace(p_doc, '\D', '', 'g'), 7, 3) || '-**'
    else '***'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------

create or replace view mcp_api.empresas with (security_invoker = true) as
  select
    c.id                                  as company_id,
    c.organization_id,
    coalesce(c.trade_name, c.legal_name)  as nome,
    c.legal_name                          as razao_social,
    c.cnpj,
    c.tax_regime::text                    as regime_tributario,
    c.is_holding                          as holding,
    c.is_active                           as ativa
  from public.companies c;

comment on view mcp_api.empresas is 'Empresas do grupo visíveis ao usuário. Junte por company_id.';

create or replace view mcp_api.contas with (security_invoker = true) as
  select
    a.id                    as account_id,
    a.company_id,
    a.code                  as codigo,
    a.name                  as conta,
    a.kind::text            as tipo,
    a.dre_section::text     as secao_dre,
    a.is_summary            as totalizadora,
    a.below_the_line        as abaixo_da_linha,
    a.parent_id,
    a.is_active             as ativa
  from public.chart_of_accounts a;

comment on view mcp_api.contas is 'Plano de contas por empresa. `totalizadora` = linha de soma da DRE: nunca some junto com as analíticas.';

create or replace view mcp_api.centros_de_custo with (security_invoker = true) as
  select cc.id as cost_center_id, cc.company_id, cc.name as nome, cc.is_active as ativo
  from public.cost_centers cc;

create or replace view mcp_api.contrapartes with (security_invoker = true) as
  select
    cp.id                          as counterparty_id,
    cp.organization_id,
    cp.name                        as nome,
    cp.kind                        as tipo,
    mcp_api.mask_cpf(cp.document)  as documento,
    cp.is_active                   as ativa
  from public.counterparties cp;

comment on view mcp_api.contrapartes is 'Clientes, fornecedores e demais contrapartes. CPF mascarado; CNPJ preservado.';

-- A view central. Carrega a semântica contábil em coluna, para que uma consulta
-- gerada por modelo não precise (nem consiga) reinventá-la.
create or replace view mcp_api.transacoes with (security_invoker = true) as
  select
    t.id                        as transaction_id,
    t.company_id,
    e.nome                      as empresa,
    t.accrual_date              as data_competencia,
    t.cash_date                 as data_caixa,
    t.due_date                  as vencimento,
    -- Valor COM SINAL: entrada positiva, saída negativa. Some esta coluna, nunca `valor_bruto`.
    case when t.direction = 'inflow' then t.amount else -t.amount end as valor,
    t.amount                    as valor_bruto,
    t.direction::text           as direcao,
    t.status::text              as status,
    -- Regime: competência inclui pendente (fato ocorrido, ainda não pago); caixa não.
    -- `scheduled` (previsão de recorrência) e `canceled` ficam fora dos dois.
    (t.status in ('settled', 'reconciled', 'pending')) as entra_em_competencia,
    (t.status in ('settled', 'reconciled'))            as entra_em_caixa,
    -- Transferência entre contas da mesma empresa não é receita nem despesa.
    (t.transfer_group_id is not null)                  as e_transferencia,
    -- Lançamento gerado pela projeção do pagar.me (não é lançamento humano).
    (t.pagarme_projection_key is not null)             as e_projecao_pagarme,
    a.codigo                    as conta_codigo,
    a.conta                     as conta,
    a.tipo                      as conta_tipo,
    a.secao_dre,
    cc.nome                     as centro_de_custo,
    cp.nome                     as contraparte,
    cp.documento                as contraparte_documento,
    t.description               as descricao,
    t.document_ref              as documento,
    t.cost_center_id,
    t.counterparty_id,
    t.bank_account_id
  from public.transactions t
  join mcp_api.empresas e on e.company_id = t.company_id
  left join mcp_api.contas a on a.account_id = t.account_id
  left join mcp_api.centros_de_custo cc on cc.cost_center_id = t.cost_center_id
  left join mcp_api.contrapartes cp on cp.counterparty_id = t.counterparty_id
  where t.deleted_at is null;

comment on view mcp_api.transacoes is
  'Lançamentos ativos. Some `valor` (já com sinal), não `valor_bruto`. Filtre por `entra_em_competencia` ou `entra_em_caixa` conforme o regime, e exclua `e_transferencia` de qualquer análise de receita ou despesa.';

-- Grants nas TABELAS-BASE.
--
-- `security_invoker` exige que o usuário tenha privilégio nas tabelas por baixo da
-- view. No remoto, `authenticated` já tem SELECT nelas (privilégio default herdado
-- de quando o projeto foi criado); num banco reconstruído só a partir das
-- migrations, não tem — e as views falhariam com "permission denied". Estes grants
-- são no-op no remoto e tornam o `db:reset` fiel.
--
-- Não afrouxam nada: a RLS continua sendo quem filtra linha, e SELECT sem policy
-- que case não devolve nada.
grant select on public.transactions      to authenticated;
grant select on public.chart_of_accounts to authenticated;
grant select on public.companies         to authenticated;
grant select on public.cost_centers      to authenticated;
grant select on public.counterparties    to authenticated;
-- A policy de `transactions` resolve o escopo por subquery em `company_access`, e
-- essa subquery roda como o INVOCADOR: sem SELECT aqui, a própria RLS falha.
grant select on public.company_access    to authenticated;

-- Leitura para usuário autenticado; a RLS das tabelas-base é quem de fato filtra.
grant usage on schema mcp_api to authenticated;
grant select on all tables in schema mcp_api to authenticated;
revoke all on schema mcp_api from anon;
alter default privileges in schema mcp_api grant select on tables to authenticated;

-- -----------------------------------------------------------------------------
-- Sandbox de SQL
-- -----------------------------------------------------------------------------

create or replace function mcp_api.run_query(p_sql text, p_limit int default 200)
returns jsonb
language plpgsql
stable                       -- parede nº 3: o executor recusa escrita aqui dentro
security invoker             -- a RLS do usuário continua valendo
set search_path = mcp_api, pg_temp   -- parede nº 1: `public` não é alcançável
as $$
declare
  v_sql   text := btrim(coalesce(p_sql, ''), E' \t\n\r;');
  v_lower text;
  v_limit int  := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_out   jsonb;
begin
  if v_sql = '' then
    raise exception 'Consulta vazia.';
  end if;

  v_lower := lower(v_sql);

  if v_sql like '%;%' then
    raise exception 'Apenas uma instrução por consulta (";" não é permitido).';
  end if;

  if v_sql ~ '(--|/\*)' then
    raise exception 'Comentários não são permitidos na consulta.';
  end if;

  if v_lower !~ '^(select|with)\M' then
    raise exception 'Apenas SELECT (ou WITH ... SELECT). Este endpoint é somente leitura.';
  end if;

  if v_lower ~ '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|vacuum|analyze|reindex|refresh|listen|notify|lock|set|reset|begin|commit|rollback|savepoint|prepare|execute|into|returning)\M' then
    raise exception 'Comando de escrita ou de sessão não permitido na consulta.';
  end if;

  if v_lower ~ '\m(public|auth|vault|storage|pg_catalog|pg_temp|information_schema|extensions|graphql|realtime|net|cron)\s*\.' then
    raise exception 'Só o schema mcp_api é consultável. Use as views: empresas, contas, centros_de_custo, contrapartes, transacoes.';
  end if;

  if v_lower ~ '\mpg_[a-z_]+' then
    raise exception 'Objetos internos do Postgres não são consultáveis.';
  end if;

  -- Consulta exploratória não pode competir com a aplicação: 5s e acabou.
  perform set_config('statement_timeout', '5000', true);

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) q limit %s) t',
    v_sql, v_limit
  ) into v_out;

  return v_out;
end;
$$;

comment on function mcp_api.run_query(text, int) is
  'SELECT livre sobre as views de mcp_api, somente leitura. Uma instrução, sem comentário, limite imposto (máx. 1000) e timeout de 5s.';

revoke execute on function mcp_api.run_query(text, int) from public, anon;
grant execute on function mcp_api.run_query(text, int) to authenticated;

-- O PostgREST só expõe os schemas configurados na API (`public` entre eles), e não
-- vamos abrir `mcp_api` — as views existem para o SQL de dentro da jaula, não para
-- serem consultadas direto de fora. Este wrapper é a única porta.
create or replace function public.mcp_run_query(p_sql text, p_limit int default 200)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select mcp_api.run_query(p_sql, p_limit);
$$;

comment on function public.mcp_run_query(text, int) is
  'Porta do sandbox de SQL do MCP. Delega para mcp_api.run_query — somente leitura, uma instrução, só as views de mcp_api.';

revoke execute on function public.mcp_run_query(text, int) from public, anon;
grant execute on function public.mcp_run_query(text, int) to authenticated;

-- -----------------------------------------------------------------------------
-- Auditoria de uso
-- -----------------------------------------------------------------------------

-- Guarda PARÂMETRO, nunca conteúdo de linha: responde "o que a IA olhou?" sem
-- criar uma segunda cópia dos dados financeiros fora das tabelas de origem.
create table if not exists public.mcp_query_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tool        text not null,
  params      jsonb not null default '{}'::jsonb,
  row_count   int,
  duration_ms int,
  error       text,
  created_at  timestamptz not null default now()
);

comment on table public.mcp_query_log is
  'Trilha de uso do servidor MCP. Append-only. `params` guarda os parâmetros da chamada, NUNCA o conteúdo das linhas retornadas.';

create index if not exists idx_mcp_log_user_created
  on public.mcp_query_log (user_id, created_at desc);

alter table public.mcp_query_log enable row level security;

-- Leitura: cada um vê o próprio rastro; super admin vê tudo.
-- Predicados sem dependência de linha vão em `(select ...)` -> InitPlan, avaliado
-- uma vez (convenção do projeto, ver `..._rls_initplan_optimization`).
create policy "mcp_query_log_sel" on public.mcp_query_log
  for select to authenticated
  using ((select public.is_super_admin()) or user_id = (select auth.uid()));

-- Escrita: só o próprio registro, e só inserção — log não se corrige.
--
-- ATENÇÃO para a Fase 4 (OAuth): quando as policies de escrita ganharem o
-- predicado `auth.jwt() ->> 'client_id' is null` para impedir que token de OAuth
-- escreva, ESTA TABELA É A EXCEÇÃO DELIBERADA. É justamente o acesso via IA que
-- precisa registrar o próprio rastro.
create policy "mcp_query_log_ins" on public.mcp_query_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert on public.mcp_query_log to authenticated;
