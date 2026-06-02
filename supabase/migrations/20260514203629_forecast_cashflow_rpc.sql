-- forecast_cashflow_daily: projects daily cash flow over a horizon by
-- combining the company's current bank balance with pending AP/AR and
-- projected recurring templates.
--
-- Returns a row per day in [p_from, p_to] with:
--   inflow_settled / outflow_settled — for the "already happened" portion when
--     the window starts in the past (rare; mostly for hindsight)
--   inflow_expected / outflow_expected — sum of pending transactions due that day
--   inflow_recurring / outflow_recurring — projected from active templates
--   running_balance — cumulative starting from opening_balance

create or replace function public.forecast_cashflow_daily(
  p_company_id uuid,
  p_from date,
  p_to date
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
security definer
set search_path = public
as $$
declare
  v_opening numeric;
begin
  -- 1. Opening balance at the start of the horizon.
  --    = sum(bank_accounts.initial_balance for this company)
  --    + signed sum of all settled/reconciled transactions with cash_date < p_from
  select coalesce(sum(ba.initial_balance), 0)
    into v_opening
    from bank_accounts ba
   where ba.company_id = p_company_id;

  select v_opening + coalesce(sum(
    case when t.direction = 'inflow' then t.amount else -t.amount end
  ), 0)
    into v_opening
    from transactions t
   where t.company_id = p_company_id
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
    where t.company_id = p_company_id
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
    where rt.company_id = p_company_id
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

grant execute on function public.forecast_cashflow_daily(uuid, date, date) to authenticated;

comment on function public.forecast_cashflow_daily(uuid, date, date) is
  'Daily cash flow forecast: opening balance + AP/AR pending + recurring projection. Scenario adjustments are applied client-side by shifting AR/AP timing.';
