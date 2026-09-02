-- =============================================================================
-- Grupos de agregação — consolidação seletiva de empresas
--
-- O PROBLEMA. O escopo de empresa tinha dois estados: uma empresa, ou "Consolidado"
-- = todas as operacionais da organização. Não havia como olhar um recorte — as duas
-- empresas do braço OTM sem a educação financeira, por exemplo. Quem precisava do
-- número somava DRE de duas telas na mão, e nada garantia que a soma manual usasse
-- o mesmo critério de status/competência que o consolidado do sistema.
--
-- O QUE ESTA MIGRATION FAZ.
--   1. `company_groups` + `company_group_members`: recortes nomeados, compartilhados
--      na organização (a equipe fala do mesmo "OTM sem Jimmy").
--   2. Um recorte só aparece para quem tem acesso a TODAS as empresas dele. Um DRE
--      rotulado "Corretora + Assessoria" que somasse só uma das duas seria um número
--      contábil errado em silêncio — o pior tipo de erro deste sistema. Melhor o
--      grupo não existir para essa pessoa do que existir pela metade.
--   3. Os RPCs de número passam a aceitar `p_company_ids uuid[]`. Onde já havia
--      agregação (DRE/KPI consolidados) é um filtro a mais; onde só existia a versão
--      de uma empresa (fluxo de caixa, forecast), a implementação passa a ser a
--      multi-empresa e a de uma empresa vira wrapper dela — para o número do grupo e
--      o número da empresa nunca poderem divergir.
--
-- CONVENÇÃO. `p_company_ids null` = comportamento anterior (todas as acessíveis /
-- a organização inteira), então nenhuma chamada existente muda de resultado. Array
-- vazio = nenhuma empresa = nenhuma linha, que é o que um grupo vazio deve somar.
-- Toda função é `security invoker`: quem filtra de verdade é a RLS, o array é só
-- recorte dentro do que a pessoa já podia ver.
-- =============================================================================

-- =============================================================================
-- 1) Tabelas
-- =============================================================================
create table public.company_groups (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name            text not null,
  description     text,
  sort_order      int not null default 0,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb,

  constraint company_groups_name_ck check (length(btrim(name)) between 1 and 80),

  -- Referenciável por FK composta a partir de company_group_members, que é como o
  -- banco garante que membro e grupo são da mesma organização.
  constraint company_groups_id_org_uk unique (id, organization_id)
);

comment on table public.company_groups is
  'Recortes nomeados de empresas para consolidação seletiva. Metadado de visualização: o número em si vem dos RPCs com RLS.';

-- Nome único por organização, sem depender de caixa nem de espaço nas pontas — dois
-- grupos "OTM" e "otm " no switcher seriam indistinguíveis para quem lê.
create unique index uq_company_groups_org_name
  on public.company_groups(organization_id, lower(btrim(name)));

create trigger trg_company_groups_updated before update on public.company_groups
  for each row execute function set_updated_at();

create trigger trg_audit_company_groups
  after insert or update or delete on public.company_groups
  for each row execute function audit_record();

create table public.company_group_members (
  -- PK própria em vez de (group_id, company_id) por causa do `audit_record()`, que grava
  -- `coalesce(new.id, old.id)` e falha em tabela sem coluna `id`. Auditar composição de
  -- grupo importa: mudar quem entra no recorte muda todo número que a tela reporta.
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null,
  company_id      uuid not null,
  organization_id uuid not null,
  created_at      timestamptz not null default now(),

  constraint company_group_members_uk unique (group_id, company_id),

  -- Grupo e empresa precisam ser da MESMA organização. CHECK não aceita subquery;
  -- as duas FKs compostas contra a mesma coluna `organization_id` fazem o trabalho.
  constraint company_group_members_group_fk
    foreign key (group_id, organization_id)
    references public.company_groups(id, organization_id)
    on delete cascade,
  constraint company_group_members_company_fk
    foreign key (company_id, organization_id)
    references public.companies(id, organization_id)
    on delete cascade
);

comment on table public.company_group_members is
  'Empresas de cada grupo de agregação. A FK composta em organization_id impede grupo com empresa de outra organização.';

create index idx_company_group_members_company on public.company_group_members(company_id);

create trigger trg_audit_company_group_members
  after insert or update or delete on public.company_group_members
  for each row execute function audit_record();

-- =============================================================================
-- 2) Visibilidade: grupo é tudo-ou-nada
--
-- Por que uma função `security definer` sem argumento, e não o predicado direto na
-- policy: a regra "o grupo tem alguma empresa fora do meu acesso?" precisa varrer
-- `company_group_members`. Escrever isso na policy de `company_group_members` seria
-- a policy consultando a própria tabela — `infinite recursion detected in policy`.
--
-- Sem argumento é o detalhe que mantém isso barato: a policy chama dentro de
-- `(select ...)`, o planner resolve como InitPlan e avalia UMA vez por statement,
-- não por linha (ver a convenção de RLS no CLAUDE.md e a migration
-- ..._rls_initplan_optimization).
-- =============================================================================
create or replace function public.visible_company_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.id
  from public.company_groups g
  where public.is_super_admin()
     or not exists (
          select 1
          from public.company_group_members m
          where m.group_id = g.id
            and m.company_id not in (
              select ca.company_id
              from public.company_access ca
              where ca.user_id = auth.uid()
            )
        );
$$;

comment on function public.visible_company_group_ids() is
  'Ids dos grupos que o usuário atual pode ver: só os grupos cujas empresas ele TODAS acessa. Sem argumento de propósito, para virar InitPlan nas policies.';

revoke execute on function public.visible_company_group_ids() from public, anon;
grant execute on function public.visible_company_group_ids() to authenticated;

-- =============================================================================
-- 3) RLS
--
-- Leitura: módulo financials + grupo visível (tudo-ou-nada, acima).
-- Escrita: papel de escrita. Criar/renomear/apagar o grupo exige admin ou editor;
-- colocar uma empresa dentro dele exige escrita NAQUELA empresa — que é o que
-- impede montar um recorte com empresa alheia.
-- =============================================================================
alter table public.company_groups enable row level security;
alter table public.company_group_members enable row level security;

create policy company_groups_sel on public.company_groups
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and id in (select public.visible_company_group_ids())
  );

create policy company_groups_ins on public.company_groups
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

create policy company_groups_upd on public.company_groups
  for update to authenticated
  using (
    id in (select public.visible_company_group_ids())
    and (
      (select public.is_super_admin())
      or (select public.current_user_role()) in ('admin', 'editor')
    )
  )
  with check (
    id in (select public.visible_company_group_ids())
    and (
      (select public.is_super_admin())
      or (select public.current_user_role()) in ('admin', 'editor')
    )
  );

create policy company_groups_del on public.company_groups
  for delete to authenticated
  using (
    id in (select public.visible_company_group_ids())
    and (
      (select public.is_super_admin())
      or (select public.current_user_role()) in ('admin', 'editor')
    )
  );

create policy company_group_members_sel on public.company_group_members
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and group_id in (select public.visible_company_group_ids())
  );

-- Escrita de membro é por linha e a tabela é pequena (nº de grupos × empresas), então
-- aqui `has_company_write_access(company_id)` direto é o certo: a checagem PRECISA
-- depender da linha, e o alerta de custo do CLAUDE.md é sobre caminho de leitura.
create policy company_group_members_ins on public.company_group_members
  for insert to authenticated
  with check (
    (select public.can_view_module('financials'))
    and public.has_company_write_access(company_id)
  );

create policy company_group_members_del on public.company_group_members
  for delete to authenticated
  using (
    (select public.can_view_module('financials'))
    and public.has_company_write_access(company_id)
  );

-- Trio restritivo: token de OAuth (cliente de IA) não escreve. Tabela nova nasce sem
-- as policies da migration ..._mcp_oauth_sem_escrita, que varreu só o que existia.
create policy oauth_sem_escrita_ins on public.company_groups
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.company_groups
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.company_groups
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

create policy oauth_sem_escrita_ins on public.company_group_members
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.company_group_members
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.company_group_members
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

grant select, insert, update, delete on public.company_groups        to authenticated;
grant select, insert, delete         on public.company_group_members to authenticated;

-- =============================================================================
-- 4) RPCs de número passam a aceitar um recorte de empresas
--
-- Regra que vale para todas: `p_company_ids null` = comportamento de antes, então
-- nenhuma chamada existente (app ou servidor MCP) muda de resultado. Array vazio =
-- nenhuma linha, que é o que um grupo sem empresa deve somar.
--
-- Os corpos abaixo foram extraídos das migrations que os definiram e receberam
-- APENAS o predicado novo — nenhuma conta, critério de status ou sinal foi tocado.
-- =============================================================================

-- DRE consolidada: agrega pelo plano-mestre. Um recorte é o mesmo cálculo com menos
-- empresas na base — por isso não existe "somar DREs de empresa", que erraria sempre
-- que duas empresas têm planos de contas diferentes.
drop function if exists public.dre_consolidated(uuid, date, date);
create function public.dre_consolidated(
  p_organization_id uuid,
  p_start date,
  p_end date,
  p_company_ids uuid[] default null
)
returns table(
  master_id uuid, parent_id uuid, code text, name text,
  kind account_kind, dre_section dre_section, is_summary boolean,
  below_the_line boolean, sign_hint text, sort_order integer,
  total numeric, total_cash numeric
)
language sql
stable
set search_path to 'public'
as $function$
  with sums as (
    select
      a.master_account_id as master_id,
      sum(
        case
          when t.accrual_date between p_start and p_end
           and t.status in ('settled','reconciled','pending')
          then case when t.direction = 'inflow' then t.amount else -t.amount end
          else 0
        end
      )::numeric as total_accrual,
      sum(
        case
          when t.cash_date between p_start and p_end
           and t.status in ('settled','reconciled')
          then case when t.direction = 'inflow' then t.amount else -t.amount end
          else 0
        end
      )::numeric as total_cash
    from v_transactions t
    join chart_of_accounts a on a.id = t.account_id
    join companies c on c.id = t.company_id
    where c.organization_id = p_organization_id
      and c.is_holding = false
      and (p_company_ids is null or c.id = any(p_company_ids))
      and a.master_account_id is not null
    group by a.master_account_id
  )
  select
    m.id, m.parent_id, m.code, m.name, m.kind, m.dre_section,
    m.is_summary, m.below_the_line, m.sign_hint, m.sort_order,
    coalesce(s.total_accrual, 0)::numeric,
    coalesce(s.total_cash, 0)::numeric
  from chart_of_accounts_master m
  left join sums s on s.master_id = m.id
  where m.organization_id = p_organization_id and m.is_active = true
  order by m.sort_order, m.code;
$function$;

grant execute on function public.dre_consolidated(uuid, date, date, uuid[]) to authenticated;
comment on function public.dre_consolidated(uuid, date, date, uuid[]) is
  'DRE consolidada em dupla base, agregada pelo plano-mestre. p_company_ids null = organização inteira; array = recorte (grupo de agregação).';

-- KPIs mensais consolidados.
drop function if exists public.kpi_dashboard_consolidated(uuid, int);
create or replace function kpi_dashboard_consolidated(
  p_organization_id uuid,
  p_year int,
  p_company_ids uuid[] default null
) returns table(
  month_start date,
  gross_revenue numeric,
  revenue_deductions numeric,
  net_revenue numeric,
  cogs numeric,
  contribution_margin numeric,
  fixed_costs numeric,
  financial_result numeric,
  net_result numeric,
  dividends numeric,
  partner_bonus numeric,
  partner_reimbursement numeric,
  cash_generation numeric,
  gross_margin_pct numeric,
  net_margin_pct numeric,
  effective_tax_rate_pct numeric
) language sql security invoker stable set search_path = public as $$
  with months as (
    select generate_series(
      make_date(p_year, 1, 1),
      make_date(p_year, 12, 1),
      interval '1 month'
    )::date as m
  ),
  monthly as (
    select
      date_trunc('month', t.accrual_date)::date as m,
      a.kind,
      sum(case when t.direction = 'inflow' then t.amount else -t.amount end)::numeric as total
    from v_transactions t
    join chart_of_accounts a on a.id = t.account_id
    join companies c on c.id = t.company_id
    where c.organization_id = p_organization_id
      and c.is_holding = false
      and (p_company_ids is null or c.id = any(p_company_ids))
      and extract(year from t.accrual_date) = p_year
      and t.status in ('settled','reconciled')
    group by 1, a.kind
  ),
  cash_monthly as (
    select
      date_trunc('month', t.cash_date)::date as m,
      sum(case when t.direction = 'inflow' then t.amount else -t.amount end)::numeric as net
    from v_transactions t
    join companies c on c.id = t.company_id
    where c.organization_id = p_organization_id
      and c.is_holding = false
      and (p_company_ids is null or c.id = any(p_company_ids))
      and extract(year from t.cash_date) = p_year
      and t.status in ('settled','reconciled')
    group by 1
  )
  select
    months.m,
    coalesce(sum(case when monthly.kind = 'revenue' then monthly.total end), 0),
    coalesce(sum(case when monthly.kind = 'revenue_deduction' then -monthly.total end), 0),
    coalesce(sum(case when monthly.kind in ('revenue','revenue_deduction') then monthly.total end), 0),
    coalesce(sum(case when monthly.kind = 'cogs' then -monthly.total end), 0),
    coalesce(sum(case when monthly.kind in ('revenue','revenue_deduction','cogs') then monthly.total end), 0),
    coalesce(sum(case when monthly.kind in ('operating_expense','personnel_expense') then -monthly.total end), 0),
    coalesce(sum(case when monthly.kind in ('financial_income','financial_expense') then monthly.total end), 0),
    coalesce(sum(case when monthly.kind in (
      'revenue','revenue_deduction','cogs','operating_expense','personnel_expense',
      'financial_income','financial_expense','tax_on_profit'
    ) then monthly.total end), 0),
    coalesce(sum(case when monthly.kind = 'dividend' then -monthly.total end), 0),
    coalesce(sum(case when monthly.kind = 'partner_bonus' then monthly.total end), 0),
    coalesce(sum(case when monthly.kind = 'partner_reimbursement' then -monthly.total end), 0),
    coalesce(max(cash_monthly.net), 0),
    case when coalesce(sum(case when monthly.kind = 'revenue' then monthly.total end), 0) = 0 then 0
      else (coalesce(sum(case when monthly.kind in ('revenue','revenue_deduction','cogs') then monthly.total end), 0)
            / nullif(sum(case when monthly.kind = 'revenue' then monthly.total end), 0)) * 100
    end,
    case when coalesce(sum(case when monthly.kind = 'revenue' then monthly.total end), 0) = 0 then 0
      else (coalesce(sum(case when monthly.kind in (
        'revenue','revenue_deduction','cogs','operating_expense','personnel_expense',
        'financial_income','financial_expense','tax_on_profit'
      ) then monthly.total end), 0)
        / nullif(sum(case when monthly.kind = 'revenue' then monthly.total end), 0)) * 100
    end,
    case when coalesce(sum(case when monthly.kind = 'revenue' then monthly.total end), 0) = 0 then 0
      else (coalesce(sum(case when monthly.kind = 'revenue_deduction' then -monthly.total end), 0)
            / nullif(sum(case when monthly.kind = 'revenue' then monthly.total end), 0)) * 100
    end
  from months
  left join monthly on monthly.m = months.m
  left join cash_monthly on cash_monthly.m = months.m
  group by months.m, cash_monthly.net
  order by months.m;
$$;

grant execute on function public.kpi_dashboard_consolidated(uuid, int, uuid[]) to authenticated;
comment on function public.kpi_dashboard_consolidated(uuid, int, uuid[]) is
  'KPIs mensais do grupo. p_company_ids null = organização inteira; array = recorte (grupo de agregação).';

-- Top despesas por conta (donut do dashboard).
drop function if exists public.expense_breakdown(uuid, uuid, date, date, int);
create or replace function expense_breakdown(
  p_company_id uuid default null,
  p_organization_id uuid default null,
  p_start date default null,
  p_end date default null,
  p_limit int default 8,
  p_company_ids uuid[] default null
) returns table(
  account_id uuid,
  account_code text,
  account_name text,
  kind account_kind,
  total numeric,
  is_other boolean
) language sql security invoker stable set search_path = public as $$
  with all_expenses as (
    select
      a.id as account_id,
      a.code as account_code,
      a.name as account_name,
      a.kind,
      sum(t.amount)::numeric as total
    from v_transactions t
    join chart_of_accounts a on a.id = t.account_id
    join companies c on c.id = t.company_id
    where
      (p_company_id is null or t.company_id = p_company_id)
      and (p_organization_id is null or c.organization_id = p_organization_id)
      and (p_company_ids is null or t.company_id = any(p_company_ids))
      and c.is_holding = false
      and t.direction = 'outflow'
      and t.accrual_date between p_start and p_end
      and t.status in ('settled','reconciled')
      and a.kind in ('cogs','operating_expense','personnel_expense','financial_expense','revenue_deduction')
    group by a.id, a.code, a.name, a.kind
  ),
  ranked as (
    select *, row_number() over (order by total desc) as rn
    from all_expenses
  )
  select
    case when rn <= p_limit then account_id else null end,
    case when rn <= p_limit then account_code else null end,
    case when rn <= p_limit then account_name else 'Outros' end,
    case when rn <= p_limit then kind else 'operating_expense'::account_kind end,
    sum(total)::numeric,
    rn > p_limit as is_other
  from ranked
  group by
    case when rn <= p_limit then account_id else null end,
    case when rn <= p_limit then account_code else null end,
    case when rn <= p_limit then account_name else 'Outros' end,
    case when rn <= p_limit then kind else 'operating_expense'::account_kind end,
    rn > p_limit
  order by sum(total) desc;
$$;

grant execute on function public.expense_breakdown(uuid, uuid, date, date, int, uuid[]) to authenticated;
comment on function public.expense_breakdown(uuid, uuid, date, date, int, uuid[]) is
  'Maiores despesas do período. p_company_ids recorta o consolidado; combinável com p_organization_id.';

-- Curva de recebíveis do pagar.me.
drop function if exists public.receivables_schedule(date, date, uuid);
create or replace function public.receivables_schedule(
  p_from date,
  p_to date,
  p_company_id uuid default null,
  p_company_ids uuid[] default null
)
returns table (
  month_start date,
  gross numeric,
  fees numeric,
  net numeric,
  installments_count int,
  settled_gross numeric,
  pending_gross numeric,
  pending_installments int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc('month', r.expected_payment_date)::date as month_start,
    sum(r.amount)                                       as gross,
    sum(r.fee + r.anticipation_fee + r.fraud_coverage_fee) as fees,
    sum(r.net_amount)                                   as net,
    count(*)::int                                       as installments_count,
    coalesce(sum(r.amount) filter (where r.status = 'paid'), 0)          as settled_gross,
    coalesce(sum(r.amount) filter (where r.status = 'waiting_funds'), 0) as pending_gross,
    -- separado de `installments_count` de propósito: o total do mês inclui
    -- parcelas já liquidadas, e somar aquele para rotular "a receber" inflaria a
    -- contagem (foi o que aconteceu na primeira versão da UI).
    count(*) filter (where r.status = 'waiting_funds')::int as pending_installments
  from public.pagarme_receivables r
  where r.type = 'credit'
    and (p_company_id is null or r.company_id = p_company_id)
    and (p_company_ids is null or r.company_id = any(p_company_ids))
    and r.expected_payment_date between p_from and p_to
  group by 1
  order by 1;
$$;

grant execute on function public.receivables_schedule(date, date, uuid, uuid[]) to authenticated;
comment on function public.receivables_schedule(date, date, uuid, uuid[]) is
  'Curva de recebíveis por mês de liquidação. p_company_id = uma empresa; p_company_ids = recorte.';

-- -----------------------------------------------------------------------------
-- Fluxo de caixa e forecast: aqui só existia a versão de UMA empresa, e a tela em
-- "Consolidado" caía silenciosamente na primeira empresa operacional
-- (src/routes/cashflow.tsx). Em vez de duplicar a conta, a implementação passa a ser
-- a multi-empresa e a de uma empresa vira wrapper dela — o número do grupo e o da
-- empresa não podem divergir porque são o mesmo código.
--
-- Sem recorte (`null`), o critério é o do consolidado do resto do sistema: exclui a
-- holding. Com recorte explícito, respeita o que o grupo pede.
-- -----------------------------------------------------------------------------
create or replace function public.cashflow_daily_multi(
  p_start date,
  p_end date,
  p_company_ids uuid[] default null
) returns table(
  day date,
  inflow numeric,
  outflow numeric,
  net numeric
) language sql security invoker stable set search_path = public as $$
  select
    t.cash_date,
    sum(case when t.direction = 'inflow' then t.amount else 0 end)::numeric,
    sum(case when t.direction = 'outflow' then t.amount else 0 end)::numeric,
    sum(case when t.direction = 'inflow' then t.amount else -t.amount end)::numeric
  from v_transactions t
  join companies c on c.id = t.company_id
  where t.cash_date between p_start and p_end
    and t.status in ('settled','reconciled')
    and case when p_company_ids is null then c.is_holding = false else c.id = any(p_company_ids) end
  group by t.cash_date
  order by t.cash_date;
$$;

create or replace function public.cashflow_daily(
  p_company_id uuid,
  p_start date,
  p_end date
) returns table(
  day date,
  inflow numeric,
  outflow numeric,
  net numeric
) language sql security invoker stable set search_path = public as $$
  select * from public.cashflow_daily_multi(p_start, p_end, array[p_company_id]);
$$;

create or replace function public.cashflow_monthly_multi(
  p_year int,
  p_company_ids uuid[] default null
) returns table(
  month_start date,
  inflow numeric,
  outflow numeric,
  net numeric
) language sql security invoker stable set search_path = public as $$
  select
    date_trunc('month', t.cash_date)::date,
    sum(case when t.direction = 'inflow' then t.amount else 0 end)::numeric,
    sum(case when t.direction = 'outflow' then t.amount else 0 end)::numeric,
    sum(case when t.direction = 'inflow' then t.amount else -t.amount end)::numeric
  from v_transactions t
  join companies c on c.id = t.company_id
  where extract(year from t.cash_date) = p_year
    and t.status in ('settled','reconciled')
    and case when p_company_ids is null then c.is_holding = false else c.id = any(p_company_ids) end
  group by date_trunc('month', t.cash_date)
  order by 1;
$$;

create or replace function public.cashflow_monthly(
  p_company_id uuid,
  p_year int
) returns table(
  month_start date,
  inflow numeric,
  outflow numeric,
  net numeric
) language sql security invoker stable set search_path = public as $$
  select * from public.cashflow_monthly_multi(p_year, array[p_company_id]);
$$;

grant execute on function public.cashflow_daily_multi(date, date, uuid[]) to authenticated;
grant execute on function public.cashflow_daily(uuid, date, date)         to authenticated;
grant execute on function public.cashflow_monthly_multi(int, uuid[])      to authenticated;
grant execute on function public.cashflow_monthly(uuid, int)             to authenticated;

comment on function public.cashflow_daily_multi(date, date, uuid[]) is
  'Fluxo de caixa realizado por dia. p_company_ids null = operacionais acessíveis; array = recorte. `cashflow_daily` é wrapper desta.';
comment on function public.cashflow_monthly_multi(int, uuid[]) is
  'Fluxo de caixa realizado por mês. p_company_ids null = operacionais acessíveis; array = recorte. `cashflow_monthly` é wrapper desta.';
create or replace function public.forecast_cashflow_daily_multi(
  p_from date,
  p_to date,
  p_company_ids uuid[] default null
)
returns table (
  day date,
  inflow_expected numeric,
  outflow_expected numeric,
  inflow_recurring numeric,
  outflow_recurring numeric,
  running_balance numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_opening numeric;
  v_ids     uuid[];
begin
  -- Conjunto efetivo: o recorte pedido ou, sem recorte, todas as operacionais que a
  -- RLS deixa esta pessoa ver (mesmo critério do consolidado de DRE/KPI, que exclui
  -- a holding).
  v_ids := coalesce(
    p_company_ids,
    (select array_agg(c.id) from public.companies c where c.is_holding = false)
  );

  -- 1. Opening balance at the start of the horizon.
  --    = sum(bank_accounts.initial_balance for this company)
  --    + signed sum of all settled/reconciled transactions with cash_date < p_from
  select coalesce(sum(ba.initial_balance), 0)
    into v_opening
    from bank_accounts ba
   where ba.company_id = any(v_ids);

  select v_opening + coalesce(sum(
    case when t.direction = 'inflow' then t.amount else -t.amount end
  ), 0)
    into v_opening
    from transactions t
   where t.company_id = any(v_ids)
     and t.deleted_at is null
     and t.status in ('settled', 'reconciled')
     and t.cash_date is not null
     and t.cash_date < p_from;

  return query
  with days as (
    select d::date as day
      from generate_series(p_from, p_to, interval '1 day') d
  ),
  pending_tx as (
    -- Pending/scheduled transactions falling in window, grouped by effective date
    select
      coalesce(t.cash_date, t.due_date, t.accrual_date) as day,
      sum(case when t.direction = 'inflow'  then (t.amount - t.paid_amount) else 0 end) as inflow,
      sum(case when t.direction = 'outflow' then (t.amount - t.paid_amount) else 0 end) as outflow
    from transactions t
    where t.company_id = any(v_ids)
      and t.deleted_at is null
      and t.status in ('pending', 'scheduled')
      and coalesce(t.cash_date, t.due_date, t.accrual_date) between p_from and p_to
    group by 1
  ),
  recurring_projection as (
    -- Project active recurring templates into the window
    select
      occ.day::date as day,
      sum(case when rt.direction = 'inflow'  then rt.amount else 0 end) as inflow,
      sum(case when rt.direction = 'outflow' then rt.amount else 0 end) as outflow
    from recurring_templates rt
    cross join lateral generate_series(
      greatest(rt.next_run_date, p_from),
      least(coalesce(rt.end_date, p_to), p_to),
      case rt.frequency
        when 'weekly'     then (rt.interval_count || ' weeks')::interval
        when 'biweekly'   then '2 weeks'::interval
        when 'monthly'    then (rt.interval_count || ' months')::interval
        when 'quarterly'  then '3 months'::interval
        when 'semiannual' then '6 months'::interval
        when 'yearly'     then (rt.interval_count || ' years')::interval
      end
    ) as occ(day)
    where rt.company_id = any(v_ids)
      and rt.is_active
      and rt.next_run_date <= p_to
    group by 1
  ),
  combined as (
    select
      d.day,
      coalesce(pt.inflow, 0)  as inflow_expected,
      coalesce(pt.outflow, 0) as outflow_expected,
      coalesce(rp.inflow, 0)  as inflow_recurring,
      coalesce(rp.outflow, 0) as outflow_recurring
    from days d
    left join pending_tx pt on pt.day = d.day
    left join recurring_projection rp on rp.day = d.day
  )
  select
    c.day,
    c.inflow_expected,
    c.outflow_expected,
    c.inflow_recurring,
    c.outflow_recurring,
    v_opening + sum(
      c.inflow_expected + c.inflow_recurring - c.outflow_expected - c.outflow_recurring
    ) over (order by c.day rows between unbounded preceding and current row) as running_balance
  from combined c
  order by c.day;
end;
$$;

create or replace function public.forecast_cashflow_daily(
  p_company_id uuid,
  p_from date,
  p_to date
) returns table (
  day date,
  inflow_expected numeric,
  outflow_expected numeric,
  inflow_recurring numeric,
  outflow_recurring numeric,
  running_balance numeric
) language sql security invoker stable set search_path = public as $$
  select * from public.forecast_cashflow_daily_multi(p_from, p_to, array[p_company_id]);
$$;

grant execute on function public.forecast_cashflow_daily_multi(date, date, uuid[]) to authenticated;
grant execute on function public.forecast_cashflow_daily(uuid, date, date)         to authenticated;

comment on function public.forecast_cashflow_daily_multi(date, date, uuid[]) is
  'Projeção diária de caixa (saldo de abertura + pendentes + recorrências) para um conjunto de empresas. p_company_ids null = operacionais acessíveis.';
comment on function public.forecast_cashflow_daily(uuid, date, date) is
  'Projeção diária de caixa de uma empresa. Wrapper de forecast_cashflow_daily_multi — a conta tem uma implementação só.';

-- Série do pagar.me destacada no forecast: mesmo tratamento, para o recorte não perder
-- o destaque de "quanto do caixa futuro é venda contratada".
drop function if exists public.forecast_pagarme_inflow(uuid, date, date);

-- `p_company_id` continua existindo (e antes de `p_company_ids` só porque parâmetro sem
-- default não pode vir depois de um com default): o servidor MCP chama esta RPC por
-- nome com p_company_id, e quebrar isso derrubaria a tool `forecast_cashflow`.
create or replace function public.forecast_pagarme_inflow(
  p_from date,
  p_to date,
  p_company_id uuid default null,
  p_company_ids uuid[] default null
)
returns table (
  day date,
  inflow_pagarme numeric,
  fees_pagarme numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with escopo as (
    -- Precedência: recorte explícito > uma empresa > todas as operacionais acessíveis.
    select coalesce(
             p_company_ids,
             case when p_company_id is not null then array[p_company_id] end,
             (select array_agg(c.id) from public.companies c where c.is_holding = false)
           ) as ids
  )
  select
    d::date as day,
    coalesce((
      select sum(t.amount - t.paid_amount)
      from public.transactions t, escopo e
      where t.company_id = any(e.ids)
        and t.deleted_at is null
        and t.pagarme_projection_key is not null
        and t.direction = 'inflow'
        and t.status in ('pending', 'scheduled')
        and coalesce(t.cash_date, t.due_date, t.accrual_date) = d::date
    ), 0) as inflow_pagarme,
    coalesce((
      select sum(t.amount - t.paid_amount)
      from public.transactions t, escopo e
      where t.company_id = any(e.ids)
        and t.deleted_at is null
        and t.pagarme_projection_key is not null
        and t.direction = 'outflow'
        and t.status in ('pending', 'scheduled')
        and coalesce(t.cash_date, t.due_date, t.accrual_date) = d::date
    ), 0) as fees_pagarme
  from generate_series(p_from, p_to, interval '1 day') d
  order by 1;
$$;

grant execute on function public.forecast_pagarme_inflow(date, date, uuid, uuid[]) to authenticated;

comment on function public.forecast_pagarme_inflow(date, date, uuid, uuid[]) is
  'Série diária das entradas (e taxas) já projetadas do pagar.me. p_company_id = uma empresa; p_company_ids = recorte; nenhum dos dois = operacionais acessíveis.';
