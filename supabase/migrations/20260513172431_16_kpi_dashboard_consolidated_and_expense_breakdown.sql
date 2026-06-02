
-- RPC: KPI dashboard consolidado (soma todas as empresas operacionais da organização)
create or replace function kpi_dashboard_consolidated(
  p_organization_id uuid,
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

-- RPC: top despesas por conta no período (para o donut)
create or replace function expense_breakdown(
  p_company_id uuid,
  p_organization_id uuid,
  p_start date,
  p_end date,
  p_limit int default 8
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

