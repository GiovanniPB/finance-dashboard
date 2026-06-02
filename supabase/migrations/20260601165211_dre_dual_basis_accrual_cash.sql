drop function if exists public.dre_by_company(uuid, date, date);
drop function if exists public.dre_consolidated(uuid, date, date);

create function public.dre_by_company(p_company_id uuid, p_start date, p_end date)
returns table(
  account_id uuid, parent_id uuid, code text, name text,
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
      a.id as account_id,
      sum(
        case
          when t.accrual_date between p_start and p_end
           and t.status in ('settled','reconciled')
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
    from chart_of_accounts a
    left join v_transactions t on t.account_id = a.id
    where a.company_id = p_company_id
    group by a.id
  )
  select
    a.id, a.parent_id, a.code, a.name, a.kind, a.dre_section,
    a.is_summary, a.below_the_line, a.sign_hint, a.sort_order,
    coalesce(s.total_accrual, 0)::numeric,
    coalesce(s.total_cash, 0)::numeric
  from chart_of_accounts a
  left join sums s on s.account_id = a.id
  where a.company_id = p_company_id and a.is_active = true
  order by a.sort_order, a.code;
$function$;

create function public.dre_consolidated(p_organization_id uuid, p_start date, p_end date)
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
           and t.status in ('settled','reconciled')
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
