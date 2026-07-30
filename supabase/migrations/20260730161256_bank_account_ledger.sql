-- Extrato por conta bancária: as RPCs que sustentam a página /contas.
--
-- Três funções novas:
--   bank_balances_multi  — saldos de várias empresas de uma vez (consolidado real)
--   bank_account_period  — abertura/entradas/saídas/fechamento de uma conta no período
--   bank_account_ledger  — linhas do extrato com saldo corrente acumulado
--
-- Todas seguem a mesma regra da bank_balances: só lançamentos `settled`, não
-- deletados, com cash_date a partir de initial_balance_date. `security invoker`
-- + RLS garantem que o usuário só enxerga empresas às quais tem acesso.

-- ===========================================================
-- Saldos de várias empresas (visão consolidada)
-- ===========================================================
create or replace function public.bank_balances_multi(
  p_as_of date,
  p_company_ids uuid[] default null
) returns table(
  company_id uuid,
  company_name text,
  bank_account_id uuid,
  bank_name text,
  nickname text,
  account_type bank_account_type,
  initial_balance numeric,
  inflow numeric,
  outflow numeric,
  closing_balance numeric
) language sql security invoker stable set search_path = public as $$
  select
    c.id,
    coalesce(c.trade_name, c.legal_name),
    ba.id,
    ba.bank_name,
    ba.nickname,
    ba.account_type,
    ba.initial_balance,
    coalesce(mov.inflow, 0),
    coalesce(mov.outflow, 0),
    ba.initial_balance + coalesce(mov.inflow, 0) - coalesce(mov.outflow, 0)
  from bank_accounts ba
  join companies c on c.id = ba.company_id
  left join lateral (
    select
      sum(t.amount) filter (where t.direction = 'inflow') as inflow,
      sum(t.amount) filter (where t.direction = 'outflow') as outflow
    from transactions t
    where t.bank_account_id = ba.id
      and t.deleted_at is null
      and t.status = 'settled'
      and t.cash_date is not null
      and t.cash_date <= p_as_of
      and (ba.initial_balance_date is null or t.cash_date >= ba.initial_balance_date)
  ) mov on true
  where ba.is_active
    and (p_company_ids is null or ba.company_id = any(p_company_ids))
  order by c.sort_order, coalesce(c.trade_name, c.legal_name), ba.sort_order, ba.nickname;
$$;

comment on function public.bank_balances_multi(date, uuid[]) is
  'Saldo das contas de várias empresas em p_as_of. p_company_ids null = todas as empresas acessíveis.';

-- ===========================================================
-- Resumo do período de uma conta
-- ===========================================================
create or replace function public.bank_account_period(
  p_bank_account_id uuid,
  p_from date,
  p_to date
) returns table(
  opening_balance numeric,
  inflow numeric,
  outflow numeric,
  closing_balance numeric
) language sql security invoker stable set search_path = public as $$
  select
    ba.initial_balance + coalesce(prev.net, 0) as opening_balance,
    coalesce(cur.inflow, 0),
    coalesce(cur.outflow, 0),
    ba.initial_balance + coalesce(prev.net, 0)
      + coalesce(cur.inflow, 0) - coalesce(cur.outflow, 0) as closing_balance
  from bank_accounts ba
  -- movimento anterior ao período, que forma o saldo de abertura
  left join lateral (
    select sum(case when t.direction = 'inflow' then t.amount else -t.amount end) as net
    from transactions t
    where t.bank_account_id = ba.id
      and t.deleted_at is null
      and t.status = 'settled'
      and t.cash_date is not null
      and t.cash_date < p_from
      and (ba.initial_balance_date is null or t.cash_date >= ba.initial_balance_date)
  ) prev on true
  -- movimento dentro do período
  left join lateral (
    select
      sum(t.amount) filter (where t.direction = 'inflow') as inflow,
      sum(t.amount) filter (where t.direction = 'outflow') as outflow
    from transactions t
    where t.bank_account_id = ba.id
      and t.deleted_at is null
      and t.status = 'settled'
      and t.cash_date is not null
      and t.cash_date between p_from and p_to
      and (ba.initial_balance_date is null or t.cash_date >= ba.initial_balance_date)
  ) cur on true
  where ba.id = p_bank_account_id;
$$;

comment on function public.bank_account_period(uuid, date, date) is
  'Abertura, entradas, saídas e fechamento de uma conta bancária no período.';

-- ===========================================================
-- Extrato com saldo corrente
-- ===========================================================
create or replace function public.bank_account_ledger(
  p_bank_account_id uuid,
  p_from date,
  p_to date
) returns table(
  transaction_id uuid,
  cash_date date,
  description text,
  direction transaction_direction,
  amount numeric,
  signed_amount numeric,
  account_code text,
  account_name text,
  counterparty_name text,
  document_ref text,
  running_balance numeric
) language sql security invoker stable set search_path = public as $$
  with opening as (
    select ba.initial_balance + coalesce((
      select sum(case when t.direction = 'inflow' then t.amount else -t.amount end)
      from transactions t
      where t.bank_account_id = ba.id
        and t.deleted_at is null
        and t.status = 'settled'
        and t.cash_date is not null
        and t.cash_date < p_from
        and (ba.initial_balance_date is null or t.cash_date >= ba.initial_balance_date)
    ), 0) as balance
    from bank_accounts ba
    where ba.id = p_bank_account_id
  ),
  lines as (
    select
      t.id,
      t.cash_date,
      t.description,
      t.direction,
      t.amount,
      case when t.direction = 'inflow' then t.amount else -t.amount end as signed_amount,
      coa.code as account_code,
      coa.name as account_name,
      cp.name as counterparty_name,
      t.document_ref,
      t.created_at
    from transactions t
    join bank_accounts ba on ba.id = t.bank_account_id
    left join chart_of_accounts coa on coa.id = t.account_id
    left join counterparties cp on cp.id = t.counterparty_id
    where t.bank_account_id = p_bank_account_id
      and t.deleted_at is null
      and t.status = 'settled'
      and t.cash_date is not null
      and t.cash_date between p_from and p_to
      and (ba.initial_balance_date is null or t.cash_date >= ba.initial_balance_date)
  )
  select
    l.id,
    l.cash_date,
    l.description,
    l.direction,
    l.amount,
    l.signed_amount,
    l.account_code,
    l.account_name,
    l.counterparty_name,
    l.document_ref,
    (select balance from opening)
      + sum(l.signed_amount) over (order by l.cash_date, l.created_at, l.id
                                   rows between unbounded preceding and current row)
  from lines l
  order by l.cash_date, l.created_at, l.id;
$$;

comment on function public.bank_account_ledger(uuid, date, date) is
  'Lançamentos liquidados de uma conta no período, com saldo corrente acumulado a partir do saldo de abertura.';

-- ===========================================================
-- bank_balances vira um recorte de bank_balances_multi, para a fórmula do
-- saldo viver num lugar só e não divergir entre as duas telas.
-- ===========================================================
create or replace function public.bank_balances(
  p_company_id uuid,
  p_as_of date
) returns table(
  bank_account_id uuid,
  bank_name text,
  nickname text,
  account_type bank_account_type,
  initial_balance numeric,
  inflow numeric,
  outflow numeric,
  closing_balance numeric
) language sql security invoker stable set search_path = public as $$
  select
    m.bank_account_id,
    m.bank_name,
    m.nickname,
    m.account_type,
    m.initial_balance,
    m.inflow,
    m.outflow,
    m.closing_balance
  from bank_balances_multi(p_as_of, array[p_company_id]) m;
$$;
