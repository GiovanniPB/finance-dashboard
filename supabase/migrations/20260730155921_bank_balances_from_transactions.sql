-- bank_balances: calcular o saldo a partir dos lançamentos, não de snapshots.
--
-- A versão anterior lia `cash_balance_snapshots` para o mês de referência e caía
-- em `bank_accounts.initial_balance` quando não achava nada. Como nenhuma UI ou
-- job alimenta essa tabela, ela está vazia e o card "Saldos por conta" sempre
-- mostrava o saldo inicial — zero, na prática — ignorando todos os lançamentos.
--
-- Agora o saldo é: saldo inicial + entradas − saídas dos lançamentos liquidados
-- (`settled`) com data de caixa entre `initial_balance_date` e a data de corte.
-- Lançamentos previstos (`scheduled`/`pending`) não entram: o card é saldo
-- realizado, não projeção — para projeção existe o Forecast.
--
-- O segundo parâmetro muda de `p_reference_month` (mês do snapshot) para
-- `p_as_of` (data de corte), então a assinatura precisa de drop + create.

drop function if exists public.bank_balances(uuid, date);

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
    ba.id,
    ba.bank_name,
    ba.nickname,
    ba.account_type,
    ba.initial_balance,
    coalesce(mov.inflow, 0),
    coalesce(mov.outflow, 0),
    ba.initial_balance + coalesce(mov.inflow, 0) - coalesce(mov.outflow, 0)
  from bank_accounts ba
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
  where ba.company_id = p_company_id and ba.is_active = true
  order by ba.sort_order, ba.nickname;
$$;

comment on function public.bank_balances(uuid, date) is
  'Saldo por conta bancária em p_as_of: initial_balance + lançamentos settled com cash_date entre initial_balance_date e p_as_of.';
