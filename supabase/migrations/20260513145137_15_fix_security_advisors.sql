
-- Recriar views com security_invoker (respeitam RLS do usuário, não do criador)
drop view if exists v_transactions_signed;
drop view if exists v_transactions;

create view v_transactions
  with (security_invoker = true) as
  select * from transactions where deleted_at is null;

create view v_transactions_signed
  with (security_invoker = true) as
  select
    t.*,
    case when t.direction = 'inflow' then t.amount else -t.amount end as signed_amount
  from transactions t
  where t.deleted_at is null;

-- Fixar search_path em todas as funções (evita injection via search_path)
alter function set_updated_at() set search_path = public;
alter function dre_by_company(uuid, date, date) set search_path = public;
alter function dre_consolidated(uuid, date, date) set search_path = public;
alter function cashflow_daily(uuid, date, date) set search_path = public;
alter function cashflow_monthly(uuid, int) set search_path = public;
alter function kpi_dashboard(uuid, int) set search_path = public;
alter function bank_balances(uuid, date) set search_path = public;

-- Revogar EXECUTE de funções internas (não-API) do anon e authenticated
revoke execute on function audit_record() from public, anon, authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;
-- is_financial_user é chamada nas policies, manter EXECUTE para authenticated
revoke execute on function is_financial_user() from public, anon;
grant execute on function is_financial_user() to authenticated;

