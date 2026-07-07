-- Verificação manual das permissões (rode contra o banco LOCAL, com Docker no ar):
--   supabase db reset
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/tests/permissions_hardening.sql
--
-- O script cria dois usuários fictícios (empresa A vs B), simula o JWT com
-- set_config('request.jwt.claims', ...) + set role authenticated, e verifica que:
--   1) viewer NÃO escreve (RLS);
--   2) usuário da empresa A NÃO lê/muta a empresa B (nem direto, nem via RPC definer→invoker);
--   3) company_stats() só devolve as empresas acessíveis;
--   4) can_view_module esconde o domínio não concedido.
-- Qualquer `raise exception` aborta com erro → falha visível.

begin;

-- ── Setup: duas empresas, dois usuários (admin da A, viewer da A com só 'financials').
do $$
declare
  v_org uuid;
  v_comp_a uuid;
  v_comp_b uuid;
  v_admin_a uuid := gen_random_uuid();
  v_viewer_a uuid := gen_random_uuid();
  v_acc_a uuid;
  v_acc_b uuid;
begin
  select id into v_org from organizations limit 1;
  insert into companies (organization_id, legal_name, trade_name, is_active)
    values (v_org, 'Empresa A LTDA', 'A', true) returning id into v_comp_a;
  insert into companies (organization_id, legal_name, trade_name, is_active)
    values (v_org, 'Empresa B LTDA', 'B', true) returning id into v_comp_b;

  -- auth.users primeiro (profiles tem FK). O trigger handle_new_user cria o profile;
  -- em seguida ajustamos role + visible_modules.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_admin_a, 'authenticated', 'authenticated',
            'admin-a@test.local', '', now(), now());
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', v_viewer_a, 'authenticated', 'authenticated',
            'viewer-a@test.local', '', now(), now());

  update profiles set role = 'admin', visible_modules = null where id = v_admin_a;
  update profiles set role = 'viewer', visible_modules = array['financials']::data_module[]
    where id = v_viewer_a;

  insert into company_access (user_id, company_id) values (v_admin_a, v_comp_a);
  insert into company_access (user_id, company_id) values (v_viewer_a, v_comp_a);

  -- Uma conta de receita por empresa (transactions.account_id é NOT NULL).
  insert into chart_of_accounts (company_id, code, name, kind, dre_section, is_active)
    values (v_comp_a, '3.01', 'Receita A', 'revenue', 'gross_revenue', true) returning id into v_acc_a;
  insert into chart_of_accounts (company_id, code, name, kind, dre_section, is_active)
    values (v_comp_b, '3.01', 'Receita B', 'revenue', 'gross_revenue', true) returning id into v_acc_b;

  -- Uma transação em cada empresa (via service role / postgres, RLS-exempt aqui no setup).
  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, description, created_by)
    values (v_comp_a, v_acc_a, 100, 'inflow', 'settled', current_date, 'A tx', v_admin_a);
  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, description, created_by)
    values (v_comp_b, v_acc_b, 200, 'inflow', 'settled', current_date, 'B tx', v_admin_a);

  -- guarda ids p/ os blocos seguintes
  perform set_config('test.comp_a', v_comp_a::text, false);
  perform set_config('test.comp_b', v_comp_b::text, false);
  perform set_config('test.admin_a', v_admin_a::text, false);
  perform set_config('test.viewer_a', v_viewer_a::text, false);
end $$;

-- helper p/ "logar" como um usuário (simula o GUC que o Supabase injeta)
create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
end $$;

-- ── T1: viewer da A NÃO escreve na própria empresa (papel viewer).
do $$
declare v_ok boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.viewer_a'), 'role','authenticated')::text, true);
  begin
    insert into transactions (company_id, amount, direction, status, accrual_date, description)
      values (current_setting('test.comp_a')::uuid, 1, 'outflow', 'pending', current_date, 'hack');
  exception when others then v_ok := true; -- RLS deve barrar
  end;
  reset role;
  if not v_ok then raise exception 'T1 FALHOU: viewer conseguiu inserir transação'; end if;
  raise notice 'T1 OK: viewer é somente-leitura';
end $$;

-- ── T2: admin da A NÃO lê a empresa B (RLS de SELECT).
do $$
declare v_cnt int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.admin_a'), 'role','authenticated')::text, true);
  select count(*) into v_cnt from transactions where company_id = current_setting('test.comp_b')::uuid;
  reset role;
  if v_cnt <> 0 then raise exception 'T2 FALHOU: admin da A leu % linhas da B', v_cnt; end if;
  raise notice 'T2 OK: sem leitura cross-company direta';
end $$;

-- ── T3: RPC (agora invoker) não vaza a empresa B para o admin da A.
do $$
declare v_cnt int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.admin_a'), 'role','authenticated')::text, true);
  select count(*) into v_cnt
    from cost_center_analysis(current_setting('test.comp_b')::uuid, current_date - 365, current_date);
  reset role;
  if v_cnt <> 0 then raise exception 'T3 FALHOU: cost_center_analysis vazou a empresa B'; end if;
  raise notice 'T3 OK: RPC não vaza cross-company';
end $$;

-- ── T4: company_stats() só devolve empresas acessíveis.
do $$
declare v_has_b boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.admin_a'), 'role','authenticated')::text, true);
  select exists(select 1 from company_stats() where company_id = current_setting('test.comp_b')::uuid) into v_has_b;
  reset role;
  if v_has_b then raise exception 'T4 FALHOU: company_stats devolveu a empresa B'; end if;
  raise notice 'T4 OK: company_stats escopado';
end $$;

-- ── T5: módulo não concedido esconde os dados (viewer só tem 'financials' → payroll vazio).
do $$
declare v_cnt int;
begin
  -- garante um funcionário na empresa A
  insert into employees (company_id, full_name, employee_kind, status, base_salary, hire_date)
    values (current_setting('test.comp_a')::uuid, 'Fulano', 'clt', 'active', 1000, current_date);
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.viewer_a'), 'role','authenticated')::text, true);
  select count(*) into v_cnt from employees where company_id = current_setting('test.comp_a')::uuid;
  reset role;
  if v_cnt <> 0 then raise exception 'T5 FALHOU: viewer sem módulo payroll viu % funcionários', v_cnt; end if;
  raise notice 'T5 OK: can_view_module esconde domínio não concedido';
end $$;

rollback;  -- não persiste os dados de teste
