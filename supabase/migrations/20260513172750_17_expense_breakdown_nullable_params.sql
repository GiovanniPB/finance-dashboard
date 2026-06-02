
-- Tornar params nullable explicitamente (generate_typescript_types lê isso)
drop function if exists expense_breakdown(uuid, uuid, date, date, int);

create or replace function expense_breakdown(
  p_company_id uuid default null,
  p_organization_id uuid default null,
  p_start date default null,
  p_end date default null,
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

