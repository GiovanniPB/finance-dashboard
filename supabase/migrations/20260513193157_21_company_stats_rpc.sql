create or replace function public.company_stats()
returns table (
  company_id uuid,
  tx_count bigint,
  tx_count_ytd bigint,
  revenue_ytd numeric,
  expense_ytd numeric,
  last_activity date,
  bank_account_count bigint,
  employee_count_active bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with year_start as (
    select date_trunc('year', current_date)::date as d
  )
  select
    c.id as company_id,
    coalesce((select count(*) from transactions t where t.company_id = c.id and t.deleted_at is null), 0) as tx_count,
    coalesce((select count(*) from transactions t where t.company_id = c.id and t.deleted_at is null and t.accrual_date >= (select d from year_start)), 0) as tx_count_ytd,
    coalesce((select sum(t.amount) from transactions t where t.company_id = c.id and t.deleted_at is null and t.direction = 'inflow' and t.accrual_date >= (select d from year_start)), 0) as revenue_ytd,
    coalesce((select sum(t.amount) from transactions t where t.company_id = c.id and t.deleted_at is null and t.direction = 'outflow' and t.accrual_date >= (select d from year_start)), 0) as expense_ytd,
    (select max(t.accrual_date) from transactions t where t.company_id = c.id and t.deleted_at is null) as last_activity,
    coalesce((select count(*) from bank_accounts b where b.company_id = c.id and b.is_active = true), 0) as bank_account_count,
    coalesce((select count(*) from employees e where e.company_id = c.id and e.status = 'active' and e.deleted_at is null), 0) as employee_count_active
  from companies c
  where c.is_active = true;
$$;

revoke all on function public.company_stats() from public;
grant execute on function public.company_stats() to authenticated;

