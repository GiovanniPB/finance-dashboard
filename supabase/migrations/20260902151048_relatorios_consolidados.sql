-- =============================================================================
-- Relatórios gerenciais consolidados + fusão de centros de custo
--
-- O PROBLEMA. `/relatorios` era a única área que exigia UMA empresa: as quatro abas
-- (centro de custo, balanço gerencial, contraparte, comparativo de DRE) só existiam
-- por empresa. Com grupos de agregação no seletor isso ficou incoerente — o grupo
-- somava DRE e caixa, mas relatório não.
--
-- Cada aba consolida de um jeito diferente, e a diferença não é detalhe:
--
--   CONTRAPARTE      trivial. `counterparties` é da ORGANIZAÇÃO, então o mesmo
--                    cliente é uma entidade só entre empresas. Basta ampliar o filtro.
--
--   COMPARATIVO DRE  natural. `dre_comparison` só chama `dre_by_company` duas vezes
--                    e faz full outer join; a versão consolidada chama
--                    `dre_consolidated` duas vezes. Nenhuma conta nova — a agregação
--                    pelo plano-mestre já existia.
--
--   CENTRO DE CUSTO  ambíguo. `cost_centers` é POR EMPRESA e o `code` foi removido em
--                    20260828182220, então não há identidade compartilhada. Nos dados
--                    reais do grupo, 40 centros ativos têm 22 nomes distintos, e a OTM
--                    Corretora prefixa os dela: `otm corretora - capex` x `capex` das
--                    outras três, `otm corretora - opex` x `opex`, e por aí. Casar só
--                    por nome fundiria 10 e deixaria 12 separados — "Capex" e
--                    "otm corretora - capex" como duas linhas, a fusão pela metade.
--
-- A DECISÃO (do dono do produto): casar por nome normalizado, o que não casar fica
-- distinto, e existir uma FUSÃO MANUAL para ajustar os divergentes. É melhor que um
-- plano-mestre de centros de custo porque os 10 nomes que já batem funcionam sem
-- cadastro nenhum, e o ajuste fica explícito onde o dado é irregular.
--
-- Fundir = dar ao centro um NOME DE CONSOLIDAÇÃO. Pôr `otm corretora - capex` num
-- grupo de fusão chamado "Capex" faz ele casar com os `capex` das outras empresas
-- automaticamente, porque a chave passa a ser o nome do grupo de fusão. É a mesma
-- regra de sempre com o nome corrigido — não uma segunda regra de casamento.
--
-- A normalização é `lower(btrim(...))`, a MESMA do índice
-- `cost_centers_company_name_active_uniq`, que já garante nome único (normalizado)
-- entre os centros ativos de uma empresa. Logo a chave dá no máximo uma linha por
-- empresa e a soma do consolidado é bem definida.
-- =============================================================================

-- =============================================================================
-- 1) Grupos de fusão de centro de custo
-- =============================================================================
create table public.cost_center_merge_groups (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  -- É este nome que vira a chave de consolidação de todos os centros do grupo.
  name            text not null,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb,

  constraint cost_center_merge_groups_name_ck check (length(btrim(name)) between 1 and 60)
);

comment on table public.cost_center_merge_groups is
  'Nome de consolidação compartilhado por centros de custo de empresas diferentes que são a mesma coisa. Metadado de visualização: não altera o nome do centro na empresa nem o lançamento.';

-- Dois grupos de fusão com o mesmo nome seriam indistinguíveis na consolidação e
-- ainda somariam juntos (a chave é o nome) — melhor impedir na origem.
create unique index uq_cost_center_merge_groups_org_name
  on public.cost_center_merge_groups (organization_id, lower(btrim(name)));

create trigger trg_cost_center_merge_groups_updated before update on public.cost_center_merge_groups
  for each row execute function set_updated_at();

create trigger trg_audit_cost_center_merge_groups
  after insert or update or delete on public.cost_center_merge_groups
  for each row execute function audit_record();

-- `set null` no delete: apagar o grupo de fusão desfaz a fusão (cada centro volta a
-- consolidar pelo próprio nome), em vez de apagar centro de custo — que levaria
-- lançamento junto.
alter table public.cost_centers
  add column merge_group_id uuid references public.cost_center_merge_groups(id) on delete set null;

comment on column public.cost_centers.merge_group_id is
  'Grupo de fusão a que este centro pertence. Nulo = consolida pelo próprio nome.';

create index idx_cost_centers_merge_group on public.cost_centers(merge_group_id)
  where merge_group_id is not null;

alter table public.cost_center_merge_groups enable row level security;

create policy cost_center_merge_groups_sel on public.cost_center_merge_groups
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or organization_id in (
           select c.organization_id
           from public.company_access ca
           join public.companies c on c.id = ca.company_id
           where ca.user_id = (select auth.uid())
         )
    )
  );

-- Escrita por papel: o grupo de fusão não é de uma empresa, é da organização, então
-- não há `has_company_write_access` a aplicar. Quem decide que dois centros são a
-- mesma coisa é quem administra o plano.
create policy cost_center_merge_groups_ins on public.cost_center_merge_groups
  for insert to authenticated
  with check (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or (
        (select public.current_user_role()) in ('admin', 'editor')
        and organization_id in (
              select c.organization_id
              from public.company_access ca
              join public.companies c on c.id = ca.company_id
              where ca.user_id = (select auth.uid())
            )
      )
    )
  );

create policy cost_center_merge_groups_upd on public.cost_center_merge_groups
  for update to authenticated
  using (
    (select public.is_super_admin())
    or (select public.current_user_role()) in ('admin', 'editor')
  )
  with check (
    (select public.is_super_admin())
    or (select public.current_user_role()) in ('admin', 'editor')
  );

create policy cost_center_merge_groups_del on public.cost_center_merge_groups
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or (select public.current_user_role()) in ('admin', 'editor')
  );

-- Trio restritivo: token de OAuth (cliente de IA) não escreve. Tabela nova nasce sem.
create policy oauth_sem_escrita_ins on public.cost_center_merge_groups
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.cost_center_merge_groups
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.cost_center_merge_groups
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

grant select, insert, update, delete on public.cost_center_merge_groups to authenticated;

-- =============================================================================
-- 2) A chave de consolidação, num lugar só
--
-- `security_invoker = true` é obrigatório: sem isso a view roda com os privilégios do
-- dono (`postgres`), que também é dono de `cost_centers`, e devolveria centro de
-- empresa alheia para qualquer usuário logado — o defeito que `v_bills` teve por 15
-- meses (ver CLAUDE.md).
-- =============================================================================
create view public.v_cost_centers_consolidated with (security_invoker = true) as
select
  cc.id,
  cc.company_id,
  cc.name,
  cc.is_active,
  cc.merge_group_id,
  coalesce(mg.name, cc.name)               as consolidated_name,
  lower(btrim(coalesce(mg.name, cc.name))) as consolidation_key
from public.cost_centers cc
left join public.cost_center_merge_groups mg on mg.id = cc.merge_group_id;

comment on view public.v_cost_centers_consolidated is
  'Centro de custo com o nome pelo qual ele consolida: o do grupo de fusão, ou o próprio. `consolidation_key` é esse nome normalizado como em cost_centers_company_name_active_uniq.';

grant select on public.v_cost_centers_consolidated to authenticated;

-- =============================================================================
-- 3) Centro de custo: a implementação passa a ser a multi-empresa
--
-- `cost_center_analysis` agrupava por `t.cost_center_id`, o que não sobrevive a mais
-- de uma empresa (o mesmo conceito tem um uuid por empresa). A versão multi agrupa
-- pela CHAVE DE CONSOLIDAÇÃO e devolve os ids que entraram na linha; a versão de uma
-- empresa vira wrapper dela, para o número da empresa e o do grupo não divergirem.
--
-- Efeito colateral deliberado: com uma empresa só, dois centros que a pessoa fundiu
-- passam a somar numa linha também. Fusão é uma afirmação de que são a mesma coisa —
-- valeria pouco se valesse só no consolidado.
-- =============================================================================
create or replace function public.cost_center_analysis_multi(
  p_from date,
  p_to date,
  p_company_ids uuid[] default null
)
returns table (
  consolidation_key text,
  cost_center_name text,
  cost_center_ids uuid[],
  companies_count int,
  revenue numeric,
  expense numeric,
  net numeric,
  margin_pct numeric,
  transaction_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with tx as (
    select
      -- Lançamento sem centro de custo cai numa chave própria, para aparecer como
      -- pendência de classificação em vez de se diluir numa linha existente.
      coalesce(v.consolidation_key, 'sem centro de custo') as consolidation_key,
      coalesce(v.consolidated_name, 'Sem centro de custo')  as cost_center_name,
      v.id      as cost_center_id,
      t.company_id,
      t.amount,
      t.direction
    from transactions t
    left join public.v_cost_centers_consolidated v on v.id = t.cost_center_id
    -- Recorte inline em vez de CTE cruzada: `FROM t, e LEFT JOIN v ON … t.col` faria o
    -- LEFT JOIN pender de `e`, e o ON não pode referenciar item irmão do FROM.
    where t.deleted_at is null
      and t.company_id = any(
            coalesce(
              p_company_ids,
              (select array_agg(c.id) from public.companies c where c.is_holding = false)
            )
          )
      and t.status in ('settled', 'reconciled', 'pending')
      and t.accrual_date between p_from and p_to
  )
  select
    tx.consolidation_key,
    -- Nomes divergentes na mesma chave são impossíveis (a chave é o nome
    -- normalizado), então min() só escolhe a grafia a exibir.
    min(tx.cost_center_name) as cost_center_name,
    coalesce(array_agg(distinct tx.cost_center_id) filter (where tx.cost_center_id is not null), '{}') as cost_center_ids,
    count(distinct tx.company_id)::int as companies_count,
    sum(case when tx.direction = 'inflow'  then tx.amount else 0 end) as revenue,
    sum(case when tx.direction = 'outflow' then tx.amount else 0 end) as expense,
    sum(case when tx.direction = 'inflow'  then tx.amount else 0 end)
      - sum(case when tx.direction = 'outflow' then tx.amount else 0 end) as net,
    case
      when sum(case when tx.direction = 'inflow' then tx.amount else 0 end) > 0
        then ((sum(case when tx.direction = 'inflow'  then tx.amount else 0 end)
             - sum(case when tx.direction = 'outflow' then tx.amount else 0 end))
             / sum(case when tx.direction = 'inflow' then tx.amount else 0 end)) * 100
      else null
    end as margin_pct,
    count(*)::int as transaction_count
  from tx
  group by tx.consolidation_key
  order by 7 desc nulls last;
$$;

grant execute on function public.cost_center_analysis_multi(date, date, uuid[]) to authenticated;

comment on function public.cost_center_analysis_multi(date, date, uuid[]) is
  'Resultado por centro de custo agrupado pela chave de consolidação (nome do grupo de fusão, ou o próprio nome, normalizado). p_company_ids null = operacionais acessíveis; array = recorte.';

-- Wrapper de uma empresa: mesma assinatura e mesmas colunas de antes, porque o
-- servidor MCP (`cost_center_analysis` em _shared/mcp/tools/analysis.ts) lê
-- `cost_center_id` do result set.
create or replace function public.cost_center_analysis(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  cost_center_id uuid,
  cost_center_name text,
  revenue numeric,
  expense numeric,
  net numeric,
  margin_pct numeric,
  transaction_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (m.cost_center_ids)[1],
    m.cost_center_name,
    m.revenue,
    m.expense,
    m.net,
    m.margin_pct,
    m.transaction_count
  from public.cost_center_analysis_multi(p_from, p_to, array[p_company_id]) m
  order by m.net desc nulls last;
$$;

grant execute on function public.cost_center_analysis(uuid, date, date) to authenticated;

comment on function public.cost_center_analysis(uuid, date, date) is
  'Resultado por centro de custo de UMA empresa. Wrapper de cost_center_analysis_multi — a conta tem uma implementação só. Respeita grupos de fusão.';

-- -----------------------------------------------------------------------------
-- Série mensal: continua por `cost_center_id`, NÃO pela chave de consolidação, porque
-- é a matéria-prima do balanço gerencial e as linhas do modelo referenciam uuid de
-- centro (`costCenterIds` em balance/schema.ts). Consolidar aqui esconderia do modelo
-- a possibilidade de compor linha com centros de empresas diferentes.
-- -----------------------------------------------------------------------------
create or replace function public.cost_center_monthly_series_multi(
  p_from date,
  p_to date,
  p_basis public.accounting_basis default 'accrual',
  p_company_ids uuid[] default null
)
returns table (
  month date,
  company_id uuid,
  cost_center_id uuid,
  cost_center_name text,
  revenue numeric,
  expense numeric,
  transaction_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc(
      'month',
      case when p_basis = 'cash' then t.cash_date else t.accrual_date end
    )::date as month,
    t.company_id,
    t.cost_center_id,
    coalesce(v.consolidated_name, 'Sem centro de custo') as cost_center_name,
    sum(case when t.direction = 'inflow'  then t.amount else 0 end) as revenue,
    sum(case when t.direction = 'outflow' then t.amount else 0 end) as expense,
    count(*)::int as transaction_count
  from transactions t
  left join public.v_cost_centers_consolidated v on v.id = t.cost_center_id
  where t.deleted_at is null
    and t.company_id = any(
          coalesce(
            p_company_ids,
            (select array_agg(c.id) from public.companies c where c.is_holding = false)
          )
        )
    and case
          when p_basis = 'cash'
            then t.status in ('settled', 'reconciled')
             and t.cash_date between p_from and p_to
          else t.status in ('settled', 'reconciled', 'pending')
             and t.accrual_date between p_from and p_to
        end
  group by 1, 2, 3, 4;
$$;

grant execute on function public.cost_center_monthly_series_multi(date, date, public.accounting_basis, uuid[]) to authenticated;

comment on function public.cost_center_monthly_series_multi(date, date, public.accounting_basis, uuid[]) is
  'Série mensal por centro de custo de um conjunto de empresas. Mantém o cost_center_id (não consolida): é a matéria-prima do balanço gerencial, cujas linhas referenciam centros específicos.';

-- Wrapper de uma empresa — assinatura e colunas preservadas para o servidor MCP.
create or replace function public.cost_center_monthly_series(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_basis public.accounting_basis default 'accrual'
)
returns table (
  month date,
  cost_center_id uuid,
  cost_center_name text,
  revenue numeric,
  expense numeric,
  transaction_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.month, m.cost_center_id, m.cost_center_name, m.revenue, m.expense, m.transaction_count
  from public.cost_center_monthly_series_multi(p_from, p_to, p_basis, array[p_company_id]) m;
$$;

grant execute on function public.cost_center_monthly_series(uuid, date, date, public.accounting_basis) to authenticated;

-- =============================================================================
-- 4) Contraparte: só ampliar o recorte
--
-- `counterparties` é da organização, então o mesmo cliente/fornecedor é uma entidade
-- só entre empresas e a soma é limpa — nenhuma decisão de casamento aqui.
--
-- `p_company_id` é conservado (e antes de `p_company_ids` porque parâmetro sem default
-- não pode vir depois de um com default): o servidor MCP chama esta RPC por nome com
-- p_company_id, e quebrar isso derrubaria a tool `counterparty_analysis`.
--
-- CUIDADO com o `security invoker`: o corpo original desta função dizia
-- `security definer`, e foi trocado depois em
-- 20260707200244_permissions_rpcs_security_invoker. Recriar a partir do texto antigo
-- reintroduziria o furo.
-- =============================================================================
drop function if exists public.counterparty_analysis(uuid, date, date, text, int);

create or replace function public.counterparty_analysis(
  p_from date,
  p_to date,
  p_company_id uuid default null,
  p_kind text default 'all',
  p_limit int default 20,
  p_company_ids uuid[] default null
)
returns table (
  counterparty_id uuid,
  counterparty_name text,
  counterparty_kind text,
  total_inflow numeric,
  total_outflow numeric,
  net numeric,
  transaction_count int,
  avg_ticket numeric,
  last_movement date,
  companies_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with tx as (
    select
      t.counterparty_id,
      t.company_id,
      t.amount,
      t.direction,
      t.accrual_date
    from transactions t
    where t.deleted_at is null
      and t.status in ('settled', 'reconciled')
      and t.accrual_date between p_from and p_to
      and t.counterparty_id is not null
      -- Precedência: recorte explícito > uma empresa > todas as operacionais acessíveis.
      and t.company_id = any(
            coalesce(
              p_company_ids,
              case when p_company_id is not null then array[p_company_id] end,
              (select array_agg(c.id) from public.companies c where c.is_holding = false)
            )
          )
  ),
  grouped as (
    select
      tx.counterparty_id,
      sum(case when tx.direction = 'inflow'  then tx.amount else 0 end) as total_inflow,
      sum(case when tx.direction = 'outflow' then tx.amount else 0 end) as total_outflow,
      count(*)::int as tx_count,
      count(distinct tx.company_id)::int as companies_count,
      max(tx.accrual_date) as last_movement
    from tx
    group by tx.counterparty_id
  )
  select
    g.counterparty_id,
    c.name as counterparty_name,
    coalesce(c.kind, 'other') as counterparty_kind,
    g.total_inflow,
    g.total_outflow,
    (g.total_inflow - g.total_outflow) as net,
    g.tx_count as transaction_count,
    case when g.tx_count > 0 then (g.total_inflow + g.total_outflow) / g.tx_count else 0 end as avg_ticket,
    g.last_movement,
    g.companies_count
  from grouped g
  join counterparties c on c.id = g.counterparty_id
  where p_kind = 'all' or c.kind = p_kind
  order by (g.total_inflow + g.total_outflow) desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.counterparty_analysis(date, date, uuid, text, int, uuid[]) to authenticated;

comment on function public.counterparty_analysis(date, date, uuid, text, int, uuid[]) is
  'Movimento por contraparte. p_company_id = uma empresa; p_company_ids = recorte; nenhum dos dois = operacionais acessíveis. companies_count diz de quantas empresas o total veio.';

-- =============================================================================
-- 5) Comparativo de DRE consolidado
--
-- Mesma estrutura da versão por empresa — dois períodos e full outer join — trocando
-- a fonte por `dre_consolidated`, que agrega pelo plano-mestre. Nenhuma conta nova:
-- somar DREs de empresa aqui erraria sempre que duas empresas têm planos diferentes,
-- e é exatamente o que o plano-mestre resolve.
-- =============================================================================
create or replace function public.dre_comparison_multi(
  p_organization_id uuid,
  p_period_a_from date,
  p_period_a_to date,
  p_period_b_from date,
  p_period_b_to date,
  p_company_ids uuid[] default null
)
returns table (
  account_id uuid,
  code text,
  name text,
  dre_section dre_section,
  kind account_kind,
  is_summary boolean,
  sort_order int,
  total_a numeric,
  total_b numeric,
  variance_abs numeric,
  variance_pct numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with a as (
    select * from public.dre_consolidated(p_organization_id, p_period_a_from, p_period_a_to, p_company_ids)
  ),
  b as (
    select * from public.dre_consolidated(p_organization_id, p_period_b_from, p_period_b_to, p_company_ids)
  )
  select
    coalesce(a.master_id, b.master_id) as account_id,
    coalesce(a.code, b.code) as code,
    coalesce(a.name, b.name) as name,
    coalesce(a.dre_section, b.dre_section) as dre_section,
    coalesce(a.kind, b.kind) as kind,
    coalesce(a.is_summary, b.is_summary) as is_summary,
    coalesce(a.sort_order, b.sort_order) as sort_order,
    coalesce(a.total, 0) as total_a,
    coalesce(b.total, 0) as total_b,
    coalesce(a.total, 0) - coalesce(b.total, 0) as variance_abs,
    case
      when coalesce(b.total, 0) = 0 then null
      else ((coalesce(a.total, 0) - coalesce(b.total, 0)) / abs(b.total)) * 100
    end as variance_pct
  from a
  full outer join b on a.master_id = b.master_id
  order by coalesce(a.sort_order, b.sort_order);
$$;

grant execute on function public.dre_comparison_multi(uuid, date, date, date, date, uuid[]) to authenticated;

comment on function public.dre_comparison_multi(uuid, date, date, date, date, uuid[]) is
  'Comparativo de DRE entre dois períodos, agregado pelo plano-mestre. p_company_ids null = organização inteira; array = recorte. A versão por empresa é dre_comparison, que usa o plano da própria empresa.';

-- =============================================================================
-- 6) Modelo do balanço gerencial passa a existir por escopo
--
-- Era um modelo por empresa (`company_id not null unique`). Agora há três escopos,
-- os mesmos do seletor:
--
--   company_id preenchido            modelo de uma empresa
--   company_group_id preenchido      modelo de um grupo de agregação
--   os dois nulos                    modelo do consolidado da organização
--
-- As linhas do modelo referenciam `costCenterIds` (uuid[] em balance/schema.ts), e
-- isso já suportava vários centros por linha — então um modelo de grupo simplesmente
-- lista os centros das empresas do grupo na mesma linha. Não depende do casamento por
-- nome; a fusão de centros só ajuda a UI a sugerir o agrupamento.
-- =============================================================================
alter table public.balance_report_models
  add column organization_id uuid references public.organizations(id) on delete restrict,
  add column company_group_id uuid references public.company_groups(id) on delete cascade;

-- Backfill antes de exigir: todo modelo existente é de uma empresa.
update public.balance_report_models m
set organization_id = c.organization_id
from public.companies c
where c.id = m.company_id and m.organization_id is null;

alter table public.balance_report_models
  alter column organization_id set not null,
  alter column company_id drop not null;

-- O unique de coluna não serve mais (company_id agora é nulo em dois dos escopos):
-- vira índice parcial, um por escopo.
alter table public.balance_report_models
  drop constraint if exists balance_report_models_company_id_key;

alter table public.balance_report_models
  add constraint balance_report_models_scope_ck
  check (num_nonnulls(company_id, company_group_id) <= 1);

create unique index uq_balance_report_models_company
  on public.balance_report_models (company_id) where company_id is not null;
create unique index uq_balance_report_models_group
  on public.balance_report_models (company_group_id) where company_group_id is not null;
create unique index uq_balance_report_models_consolidated
  on public.balance_report_models (organization_id)
  where company_id is null and company_group_id is null;

comment on column public.balance_report_models.company_group_id is
  'Grupo de agregação a que este modelo pertence. Com company_id e company_group_id nulos, o modelo é o do consolidado da organização.';

-- Policies: o escopo muda, então as quatro são reescritas.
--
-- Leitura: empresa acessível, ou grupo visível (a mesma regra tudo-ou-nada dos
-- grupos, via hidden_company_group_ids), ou consolidado da organização acessível.
-- Escrita: empresa com acesso de escrita; grupo e consolidado exigem papel — não há
-- uma empresa a que atribuir a permissão.
drop policy if exists "balance_report_models_sel" on public.balance_report_models;
create policy balance_report_models_sel on public.balance_report_models
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or (
        company_id is not null
        and company_id in (
              select ca.company_id from public.company_access ca
              where ca.user_id = (select auth.uid())
            )
      )
      or (
        company_group_id is not null
        and company_group_id not in (select public.hidden_company_group_ids())
      )
      or (
        company_id is null
        and company_group_id is null
        and organization_id in (
              select c.organization_id
              from public.company_access ca
              join public.companies c on c.id = ca.company_id
              where ca.user_id = (select auth.uid())
            )
      )
    )
  );

drop policy if exists "balance_report_models_ins" on public.balance_report_models;
create policy balance_report_models_ins on public.balance_report_models
  for insert to authenticated
  with check (
    case
      when company_id is not null then public.has_company_write_access(company_id)
      else
        (select public.is_super_admin())
        or (select public.current_user_role()) in ('admin', 'editor')
    end
  );

drop policy if exists "balance_report_models_upd" on public.balance_report_models;
create policy balance_report_models_upd on public.balance_report_models
  for update to authenticated
  using (
    case
      when company_id is not null then public.has_company_write_access(company_id)
      else
        (select public.is_super_admin())
        or (select public.current_user_role()) in ('admin', 'editor')
    end
  )
  with check (
    case
      when company_id is not null then public.has_company_write_access(company_id)
      else
        (select public.is_super_admin())
        or (select public.current_user_role()) in ('admin', 'editor')
    end
  );

drop policy if exists "balance_report_models_del" on public.balance_report_models;
create policy balance_report_models_del on public.balance_report_models
  for delete to authenticated
  using (
    case
      when company_id is not null then public.has_company_write_access(company_id)
      else
        (select public.is_super_admin())
        or (select public.current_user_role()) in ('admin', 'editor')
    end
  );
