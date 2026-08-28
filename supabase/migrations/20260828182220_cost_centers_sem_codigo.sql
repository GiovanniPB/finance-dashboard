-- Centro de custo passa a ser identificado só pelo UUID.
--
-- O `code` era digitado à mão na criação e não carregava nenhuma informação que o
-- nome já não tivesse ('RCO-OPEX' / 'RCO OPEX', 'OTM-A-ASS' / 'OTM - Assessores').
-- Em compensação, a unicidade por código deixava passar duplicata de verdade:
-- em OTM ASSESSORIA existem dois centros chamados 'RCO IMPOSTOS' (codes 'RCO-IMP'
-- e 'RCO-IMP-'), que o usuário criou justamente para contornar o código já tomado.
-- Todas as FKs (transactions, recurring_templates, employees, payroll_account_mappings)
-- já apontam para cost_centers.id — o código só existia na UI e no importador de CSV.

-- 1. A RPC devolve o código no result set; o tipo de retorno muda, então precisa
--    ser derrubada antes (create or replace não altera OUT parameters).
drop function if exists public.cost_center_analysis(uuid, date, date);

-- 2. Some a coluna. O `unique (company_id, code)` cai junto.
alter table public.cost_centers drop column code;

-- 3. A integridade que o código dava passa para o nome, entre os centros ativos da
--    empresa: normalizado (case/espaço) para 'RCO OPEX' e 'rco opex ' colidirem.
--    Parcial em is_active para não quebrar com a duplicata histórica acima, que já
--    está inativa e sem lançamento.
create unique index cost_centers_company_name_active_uniq
  on public.cost_centers (company_id, lower(btrim(name)))
  where is_active;

-- 4. Mesma agregação de antes, sem cost_center_code.
create function public.cost_center_analysis(
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
-- Sem `security definer`: RPC de dados roda com os privilégios de quem chama, para
-- a RLS de transactions/cost_centers valer. Ver 20260707200244_permissions_rpcs_security_invoker.
set search_path to 'public'
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
