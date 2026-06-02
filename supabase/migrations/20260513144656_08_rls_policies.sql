
-- enable RLS em todas as tabelas
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table companies enable row level security;
alter table chart_of_accounts_master enable row level security;
alter table chart_of_accounts enable row level security;
alter table cost_centers enable row level security;
alter table bank_accounts enable row level security;
alter table cash_balance_snapshots enable row level security;
alter table counterparties enable row level security;
alter table transactions enable row level security;
alter table recurring_templates enable row level security;
alter table employees enable row level security;
alter table payroll_runs enable row level security;
alter table payroll_items enable row level security;
alter table import_batches enable row level security;
alter table import_rows enable row level security;
alter table audit_log enable row level security;

-- helper: usuário autenticado tem profile?
create or replace function is_financial_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid())
$$;
grant execute on function is_financial_user() to authenticated;

-- policy "financial user" tem acesso total a todas as tabelas de negócio
do $$
declare t text;
begin
  for t in select unnest(array[
    'organizations','companies','chart_of_accounts_master','chart_of_accounts',
    'cost_centers','bank_accounts','cash_balance_snapshots','counterparties',
    'transactions','recurring_templates','employees','payroll_runs',
    'payroll_items','import_batches','import_rows'
  ]) loop
    execute format($p$
      create policy financial_all on %I
      for all to authenticated
      using (is_financial_user())
      with check (is_financial_user())
    $p$, t);
  end loop;
end $$;

-- profiles: leitura geral, edição apenas do próprio
create policy profiles_read_all on profiles for select to authenticated
  using (is_financial_user());
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_self on profiles for insert to authenticated
  with check (id = auth.uid());

-- audit_log: somente leitura
create policy audit_read on audit_log for select to authenticated
  using (is_financial_user());

