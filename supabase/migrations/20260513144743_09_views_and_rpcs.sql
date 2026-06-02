
-- view: transactions ativas
create or replace view v_transactions as
  select * from transactions where deleted_at is null;

-- view: signed_amount (negativo se outflow, positivo se inflow) — facilita SUM direto
create or replace view v_transactions_signed as
  select
    t.*,
    case when t.direction = 'inflow' then t.amount else -t.amount end as signed_amount
  from transactions t
  where t.deleted_at is null;

-- ===========================================================
-- DRE detalhada por empresa (com hierarquia e summary lines)
-- ===========================================================
create or replace function dre_by_company(
  p_company_id uuid,
  p_start date,
  p_end date
) returns table(
  account_id uuid,
  parent_id uuid,
  code text,
  name text,
  kind account_kind,
  dre_section dre_section,
  is_summary boolean,
  below_the_line boolean,
  sign_hint text,
  sort_order int,
  total numeric
) language sql security invoker stable as $$
  with sums as (
    select
      a.id as account_id,
      sum(case when t.direction = 'inflow' then t.amount else -t.amount end)::numeric as total
    from chart_of_accounts a
    left join v_transactions t
      on t.account_id = a.id
      and t.accrual_date between p_start and p_end
      and t.status in ('settled','reconciled')
    where a.company_id = p_company_id
    group by a.id
  )
  select
    a.id, a.parent_id, a.code, a.name, a.kind, a.dre_section,
    a.is_summary, a.below_the_line, a.sign_hint, a.sort_order,
    coalesce(s.total, 0)::numeric
  from chart_of_accounts a
  left join sums s on s.account_id = a.id
  where a.company_id = p_company_id and a.is_active = true
  order by a.sort_order, a.code;
$$;

-- ===========================================================
-- DRE consolidada (todas as empresas via master)
-- ===========================================================
create or replace function dre_consolidated(
  p_organization_id uuid,
  p_start date,
  p_end date
) returns table(
  master_id uuid,
  parent_id uuid,
  code text,
  name text,
  kind account_kind,
  dre_section dre_section,
  is_summary boolean,
  below_the_line boolean,
  sign_hint text,
  sort_order int,
  total numeric
) language sql security invoker stable as $$
  with sums as (
    select
      a.master_account_id as master_id,
      sum(case when t.direction = 'inflow' then t.amount else -t.amount end)::numeric as total
    from v_transactions t
    join chart_of_accounts a on a.id = t.account_id
    join companies c on c.id = t.company_id
    where c.organization_id = p_organization_id
      and c.is_holding = false
      and t.accrual_date between p_start and p_end
      and t.status in ('settled','reconciled')
      and a.master_account_id is not null
    group by a.master_account_id
  )
  select
    m.id, m.parent_id, m.code, m.name, m.kind, m.dre_section,
    m.is_summary, m.below_the_line, m.sign_hint, m.sort_order,
    coalesce(s.total, 0)::numeric
  from chart_of_accounts_master m
  left join sums s on s.master_id = m.id
  where m.organization_id = p_organization_id and m.is_active = true
  order by m.sort_order, m.code;
$$;

-- ===========================================================
-- Fluxo de caixa diário
-- ===========================================================
create or replace function cashflow_daily(
  p_company_id uuid,
  p_start date,
  p_end date
) returns table(
  day date,
  inflow numeric,
  outflow numeric,
  net numeric
) language sql security invoker stable as $$
  select
    t.cash_date,
    sum(case when t.direction = 'inflow' then t.amount else 0 end)::numeric,
    sum(case when t.direction = 'outflow' then t.amount else 0 end)::numeric,
    sum(case when t.direction = 'inflow' then t.amount else -t.amount end)::numeric
  from v_transactions t
  where t.company_id = p_company_id
    and t.cash_date between p_start and p_end
    and t.status in ('settled','reconciled')
  group by t.cash_date
  order by t.cash_date;
$$;

-- ===========================================================
-- Fluxo de caixa mensal por empresa
-- ===========================================================
create or replace function cashflow_monthly(
  p_company_id uuid,
  p_year int
) returns table(
  month_start date,
  inflow numeric,
  outflow numeric,
  net numeric
) language sql security invoker stable as $$
  select
    date_trunc('month', t.cash_date)::date,
    sum(case when t.direction = 'inflow' then t.amount else 0 end)::numeric,
    sum(case when t.direction = 'outflow' then t.amount else 0 end)::numeric,
    sum(case when t.direction = 'inflow' then t.amount else -t.amount end)::numeric
  from v_transactions t
  where t.company_id = p_company_id
    and extract(year from t.cash_date) = p_year
    and t.status in ('settled','reconciled')
  group by date_trunc('month', t.cash_date)
  order by 1;
$$;

-- ===========================================================
-- KPI dashboard: todos os indicadores principais por mês de um ano
-- (replica os cards do DASHBOARD da planilha)
-- ===========================================================
create or replace function kpi_dashboard(
  p_company_id uuid,
  p_year int
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
) language sql security invoker stable as $$
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
    where t.company_id = p_company_id
      and extract(year from t.accrual_date) = p_year
      and t.status in ('settled','reconciled')
    group by 1, a.kind
  ),
  cash_monthly as (
    select
      date_trunc('month', t.cash_date)::date as m,
      sum(case when t.direction = 'inflow' then t.amount else -t.amount end)::numeric as net
    from v_transactions t
    where t.company_id = p_company_id
      and extract(year from t.cash_date) = p_year
      and t.status in ('settled','reconciled')
    group by 1
  )
  select
    months.m,
    coalesce(sum(case when monthly.kind = 'revenue' then monthly.total end), 0),
    coalesce(sum(case when monthly.kind = 'revenue_deduction' then -monthly.total end), 0),  -- positivo
    coalesce(sum(case when monthly.kind in ('revenue','revenue_deduction') then monthly.total end), 0),
    coalesce(sum(case when monthly.kind = 'cogs' then -monthly.total end), 0),  -- positivo
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

-- ===========================================================
-- Saldo de aplicações (totais por banco em determinada data)
-- ===========================================================
create or replace function bank_balances(
  p_company_id uuid,
  p_reference_month date
) returns table(
  bank_account_id uuid,
  bank_name text,
  nickname text,
  account_type bank_account_type,
  closing_balance numeric
) language sql security invoker stable as $$
  select
    ba.id,
    ba.bank_name,
    ba.nickname,
    ba.account_type,
    coalesce(cbs.closing_balance, ba.initial_balance)
  from bank_accounts ba
  left join cash_balance_snapshots cbs
    on cbs.bank_account_id = ba.id
    and cbs.reference_month = p_reference_month
  where ba.company_id = p_company_id and ba.is_active = true
  order by ba.sort_order, ba.nickname;
$$;

