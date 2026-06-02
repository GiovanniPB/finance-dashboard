
-- RPC: posta a folha — gera transactions a partir dos payroll_items e marca o run como 'posted'.
-- Para cada item:
--   - employer_cost vira transaction (outflow) na conta indicada (mapeada por payment_type → chart of accounts)
--   - description = "Folha YYYY-MM · employee_name (tipo)"
--   - accrual_date = último dia do reference_month
--   - cash_date = mesmo (assumindo regime caixa = competência por enquanto)
create or replace function post_payroll_run(
  p_run_id uuid,
  p_default_account_id uuid -- conta usada para itens cujo payment_type não tem mapping específico
) returns table(
  generated_count int,
  total_amount numeric
) language plpgsql security invoker set search_path = public as $$
declare
  v_run payroll_runs%rowtype;
  v_company_id uuid;
  v_user_id uuid;
  v_count int := 0;
  v_total numeric := 0;
begin
  select * into v_run from payroll_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'Payroll run % not found', p_run_id;
  end if;
  if v_run.status = 'posted' then
    raise exception 'Payroll run already posted';
  end if;

  v_company_id := v_run.company_id;
  v_user_id := auth.uid();

  -- Insere uma transaction por payroll_item (employer_cost > 0)
  with inserted as (
    insert into transactions (
      company_id, account_id, cost_center_id, amount, direction, status,
      accrual_date, cash_date, description, created_by, payroll_item_id, metadata
    )
    select
      v_company_id,
      p_default_account_id,
      e.cost_center_id,
      pi.employer_cost,
      'outflow'::transaction_direction,
      'settled'::transaction_status,
      (date_trunc('month', v_run.reference_month) + interval '1 month - 1 day')::date,
      (date_trunc('month', v_run.reference_month) + interval '1 month - 1 day')::date,
      'Folha ' || to_char(v_run.reference_month, 'YYYY-MM') || ' · ' || e.full_name || ' (' || pi.payment_type::text || ')',
      v_user_id,
      pi.id,
      jsonb_build_object(
        'source', 'payroll_post',
        'payroll_run_id', v_run.id,
        'reference_month', v_run.reference_month,
        'payment_type', pi.payment_type
      )
    from payroll_items pi
    join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id
      and pi.employer_cost > 0
    returning amount
  )
  select count(*)::int, coalesce(sum(amount), 0) into v_count, v_total from inserted;

  -- Atualiza o run
  update payroll_runs
  set status = 'posted',
      posted_at = now(),
      total_fixed = (select coalesce(sum(gross_amount), 0) from payroll_items where payroll_run_id = p_run_id and payment_type = 'fixed'),
      total_variable = (select coalesce(sum(gross_amount), 0) from payroll_items where payroll_run_id = p_run_id and payment_type in ('variable','bonus','vacation','thirteenth')),
      total_benefits = (select coalesce(sum(benefits), 0) from payroll_items where payroll_run_id = p_run_id),
      total_charges = (select coalesce(sum(fgts + inss + irrf), 0) from payroll_items where payroll_run_id = p_run_id),
      updated_at = now()
  where id = p_run_id;

  return query select v_count, v_total;
end;
$$;

-- RPC: cria um novo run e auto-popula items dos colaboradores ativos com o salário base
create or replace function create_payroll_run_with_active_employees(
  p_company_id uuid,
  p_reference_month date
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_run_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  insert into payroll_runs (company_id, reference_month, status, created_by)
  values (p_company_id, date_trunc('month', p_reference_month), 'draft', v_user_id)
  returning id into v_run_id;

  insert into payroll_items (payroll_run_id, employee_id, payment_type, gross_amount)
  select v_run_id, e.id, 'fixed'::payroll_payment_type, e.base_salary
  from employees e
  where e.company_id = p_company_id
    and e.status = 'active'
    and e.deleted_at is null;

  return v_run_id;
end;
$$;

