-- cost_center_analysis: revenue, expense, margin grouped by cost center.
-- Counts unallocated transactions separately so totals reconcile with DRE.
create or replace function public.cost_center_analysis(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  cost_center_id uuid,
  cost_center_code text,
  cost_center_name text,
  revenue numeric,
  expense numeric,
  net numeric,
  margin_pct numeric,
  transaction_count int
)
language sql
stable
security definer
set search_path = public
as $$
  with tx as (
    select
      t.cost_center_id,
      a.kind,
      t.amount,
      t.direction
    from transactions t
    join chart_of_accounts a on a.id = t.account_id
    where t.company_id = p_company_id
      and t.deleted_at is null
      and t.status in ('settled', 'reconciled')
      and t.accrual_date between p_from and p_to
  ),
  grouped as (
    select
      tx.cost_center_id,
      sum(case when tx.direction = 'inflow'  then tx.amount else 0 end) as revenue,
      sum(case when tx.direction = 'outflow' then tx.amount else 0 end) as expense,
      count(*)::int as tx_count
    from tx
    group by tx.cost_center_id
  )
  select
    g.cost_center_id,
    coalesce(cc.code, '—') as cost_center_code,
    coalesce(cc.name, 'Sem centro de custo') as cost_center_name,
    g.revenue,
    g.expense,
    (g.revenue - g.expense) as net,
    case when g.revenue > 0 then ((g.revenue - g.expense) / g.revenue) * 100 else null end as margin_pct,
    g.tx_count as transaction_count
  from grouped g
  left join cost_centers cc on cc.id = g.cost_center_id
  order by (g.revenue - g.expense) desc nulls last;
$$;

grant execute on function public.cost_center_analysis(uuid, date, date) to authenticated;

-- counterparty_analysis: top counterparties by volume (signed).
-- p_kind filters by counterparty.kind ('customer', 'supplier', etc.) or 'all'.
create or replace function public.counterparty_analysis(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_kind text default 'all',
  p_limit int default 20
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
  last_movement date
)
language sql
stable
security definer
set search_path = public
as $$
  with tx as (
    select
      t.counterparty_id,
      t.amount,
      t.direction,
      t.accrual_date
    from transactions t
    where t.company_id = p_company_id
      and t.deleted_at is null
      and t.status in ('settled', 'reconciled')
      and t.accrual_date between p_from and p_to
      and t.counterparty_id is not null
  ),
  grouped as (
    select
      tx.counterparty_id,
      sum(case when tx.direction = 'inflow'  then tx.amount else 0 end) as total_inflow,
      sum(case when tx.direction = 'outflow' then tx.amount else 0 end) as total_outflow,
      count(*)::int as tx_count,
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
    g.last_movement
  from grouped g
  join counterparties c on c.id = g.counterparty_id
  where p_kind = 'all' or c.kind = p_kind
  order by (g.total_inflow + g.total_outflow) desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.counterparty_analysis(uuid, date, date, text, int) to authenticated;

-- dre_comparison: returns the DRE rollup for two arbitrary periods side-by-side
-- with variance metrics. Used for MoM / YoY comparisons.
create or replace function public.dre_comparison(
  p_company_id uuid,
  p_period_a_from date,
  p_period_a_to date,
  p_period_b_from date,
  p_period_b_to date
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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with a as (
    select * from dre_by_company(p_company_id, p_period_a_from, p_period_a_to)
  ),
  b as (
    select * from dre_by_company(p_company_id, p_period_b_from, p_period_b_to)
  )
  select
    coalesce(a.account_id, b.account_id) as account_id,
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
  full outer join b on a.account_id = b.account_id
  order by coalesce(a.sort_order, b.sort_order);
end;
$$;

grant execute on function public.dre_comparison(uuid, date, date, date, date) to authenticated;
