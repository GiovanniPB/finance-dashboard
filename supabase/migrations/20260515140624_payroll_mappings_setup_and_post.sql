-- Helper: find a company account by code (active only)
create or replace function public._find_company_account(p_company_id uuid, p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from chart_of_accounts
   where company_id = p_company_id and code = p_code and is_active
   limit 1;
$$;

-- setup_payroll_mappings_defaults: populate defaults for a company based on the
-- chart of accounts seeded in OTM Group's template. Idempotent: re-running
-- only fills missing rows (does not overwrite manual edits).
--
-- Also creates account "2.10 IRRF a Recolher - Folha" (liability) when absent.
create or replace function public.setup_payroll_mappings_defaults(p_company_id uuid)
returns setof public.payroll_account_mappings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_irrf_passivo uuid;
  v_inss_passivo uuid;
  v_account uuid;
begin
  -- Ensure IRRF withholding liability account exists.
  v_irrf_passivo := _find_company_account(p_company_id, '2.10');
  if v_irrf_passivo is null then
    insert into chart_of_accounts (
      company_id, code, name, kind, dre_section, sign_hint, sort_order, is_active, notes
    )
    values (
      p_company_id, '2.10', 'IRRF a Recolher - Folha', 'liability',
      'balance_snapshot', '+', 210, true,
      'Conta de passivo para retencao de IRRF dos funcionarios (folha)'
    )
    returning id into v_irrf_passivo;
  end if;

  v_inss_passivo := _find_company_account(p_company_id, '2.11');
  if v_inss_passivo is null then
    insert into chart_of_accounts (
      company_id, code, name, kind, dre_section, sign_hint, sort_order, is_active, notes
    )
    values (
      p_company_id, '2.11', 'INSS a Recolher - Folha', 'liability',
      'balance_snapshot', '+', 211, true,
      'Conta de passivo para retencao de INSS dos funcionarios (folha)'
    )
    returning id into v_inss_passivo;
  end if;

  -- Default mapping rows
  -- Partner (assessor): fixo → 4.01; variavel/bonus → 4.02
  v_account := _find_company_account(p_company_id, '4.01');
  if v_account is not null then
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'partner', 'salary_fixed', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
  end if;

  v_account := _find_company_account(p_company_id, '4.02');
  if v_account is not null then
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'partner', 'salary_variable', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'partner', 'salary_bonus', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
  end if;

  -- CLT
  v_account := _find_company_account(p_company_id, '6.1.01');
  if v_account is not null then
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'clt', 'salary_fixed', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'clt', 'salary_variable', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'clt', 'salary_bonus', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
  end if;

  v_account := _find_company_account(p_company_id, '6.1.02');
  if v_account is not null then
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'clt', 'fgts', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
  end if;

  v_account := _find_company_account(p_company_id, '6.1.06');
  if v_account is not null then
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'clt', 'benefits', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
  end if;

  -- Withholding liabilities (CLT only — partners normally have no withholding)
  insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
  values (p_company_id, 'clt', 'irrf_withheld', v_irrf_passivo)
  on conflict (company_id, employee_kind, component) do nothing;

  insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
  values (p_company_id, 'clt', 'inss_withheld', v_inss_passivo)
  on conflict (company_id, employee_kind, component) do nothing;

  -- PJ / Intern: defaults pointing to 6.2.20 (Consultoria/Assessoria) for PJ
  -- and 6.1.01 (Salarios) for Intern. Leave variable/bonus unset for these
  -- kinds; user can complete manually if needed.
  v_account := _find_company_account(p_company_id, '6.2.20');
  if v_account is not null then
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'pj', 'salary_fixed', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
  end if;

  v_account := _find_company_account(p_company_id, '6.1.01');
  if v_account is not null then
    insert into payroll_account_mappings (company_id, employee_kind, component, account_id)
    values (p_company_id, 'intern', 'salary_fixed', v_account)
    on conflict (company_id, employee_kind, component) do nothing;
  end if;

  return query
  select * from payroll_account_mappings where company_id = p_company_id
   order by employee_kind, component;
end;
$$;

grant execute on function public.setup_payroll_mappings_defaults(uuid) to authenticated;

-- Refactor post_payroll_run: fan out each payroll_item into multiple transactions
-- based on payroll_account_mappings. Falls back to p_default_account_id when a
-- mapping is missing for a given (kind, component).
create or replace function public.post_payroll_run(
  p_run_id uuid,
  p_default_account_id uuid
)
returns table (generated_count int, total_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run payroll_runs%rowtype;
  v_user_id uuid;
  v_count int := 0;
  v_total numeric := 0;
  v_competence_date date;
begin
  select * into v_run from payroll_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'Payroll run % not found', p_run_id;
  end if;
  if v_run.status = 'posted' then
    raise exception 'Payroll run already posted';
  end if;

  v_user_id := auth.uid();
  v_competence_date := (date_trunc('month', v_run.reference_month) + interval '1 month - 1 day')::date;

  -- Build a "long" table of (item, employee, component, amount) from the row's
  -- non-zero columns, then resolve account_id from mappings (or fallback).
  with components as (
    -- salary_fixed: from fixed_amount, OR from gross when payment_type='fixed'
    -- and breakdown columns are zero
    select pi.id as item_id, e.id as employee_id, e.cost_center_id, e.employee_kind,
           e.full_name, pi.payment_type,
           'salary_fixed'::payroll_component as component,
           case
             when pi.fixed_amount > 0 then pi.fixed_amount
             when pi.payment_type = 'fixed'
              and pi.variable_amount = 0
              and pi.bonus_amount = 0
              and pi.profit_sharing_amount = 0 then pi.gross_amount
             else 0
           end as amount
    from payroll_items pi
    join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id

    union all
    -- salary_variable: variable_amount + gross when payment_type is variable/vacation/etc and breakdown=0
    select pi.id, e.id, e.cost_center_id, e.employee_kind, e.full_name, pi.payment_type,
           'salary_variable'::payroll_component,
           case
             when pi.variable_amount > 0 then pi.variable_amount
             when pi.payment_type in ('variable','vacation','thirteenth','severance','adjustment')
              and pi.fixed_amount = 0 and pi.bonus_amount = 0
              and pi.profit_sharing_amount = 0 then pi.gross_amount
             else 0
           end
    from payroll_items pi
    join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id

    union all
    -- salary_bonus: bonus_amount + profit_sharing_amount + gross when payment_type='bonus' and breakdown=0
    select pi.id, e.id, e.cost_center_id, e.employee_kind, e.full_name, pi.payment_type,
           'salary_bonus'::payroll_component,
           case
             when pi.bonus_amount + pi.profit_sharing_amount > 0
               then pi.bonus_amount + pi.profit_sharing_amount
             when pi.payment_type = 'bonus' and pi.fixed_amount = 0
              and pi.variable_amount = 0 then pi.gross_amount
             else 0
           end
    from payroll_items pi
    join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id

    union all
    select pi.id, e.id, e.cost_center_id, e.employee_kind, e.full_name, pi.payment_type,
           'fgts'::payroll_component, pi.fgts
    from payroll_items pi
    join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id

    union all
    select pi.id, e.id, e.cost_center_id, e.employee_kind, e.full_name, pi.payment_type,
           'benefits'::payroll_component, pi.benefits
    from payroll_items pi
    join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id

    union all
    select pi.id, e.id, e.cost_center_id, e.employee_kind, e.full_name, pi.payment_type,
           'irrf_withheld'::payroll_component, pi.irrf
    from payroll_items pi
    join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id

    union all
    select pi.id, e.id, e.cost_center_id, e.employee_kind, e.full_name, pi.payment_type,
           'inss_withheld'::payroll_component, pi.inss
    from payroll_items pi
    join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id
  ),
  resolved as (
    select
      c.*,
      coalesce(pam.account_id, p_default_account_id) as account_id,
      coalesce(pam.cost_center_id, c.cost_center_id) as posting_cost_center_id
    from components c
    left join payroll_account_mappings pam
      on pam.company_id = v_run.company_id
     and pam.employee_kind = c.employee_kind
     and pam.component = c.component
    where c.amount > 0.005
  ),
  inserted as (
    insert into transactions (
      company_id, account_id, cost_center_id, amount, direction, status,
      accrual_date, cash_date, description, created_by, payroll_item_id, metadata
    )
    select
      v_run.company_id,
      r.account_id,
      r.posting_cost_center_id,
      r.amount,
      'outflow',
      'settled',
      v_competence_date,
      v_competence_date,
      'Folha ' || to_char(v_run.reference_month, 'YYYY-MM')
        || ' · ' || r.full_name
        || ' · ' || r.component::text,
      v_user_id,
      r.item_id,
      jsonb_build_object(
        'source', 'payroll_post',
        'payroll_run_id', v_run.id,
        'reference_month', v_run.reference_month,
        'payment_type', r.payment_type,
        'component', r.component
      )
    from resolved r
    returning amount
  )
  select count(*)::int, coalesce(sum(amount), 0) into v_count, v_total from inserted;

  update payroll_runs
  set status = 'posted',
      posted_at = now(),
      total_fixed = (select coalesce(sum(gross_amount), 0) from payroll_items
                      where payroll_run_id = p_run_id and payment_type = 'fixed'),
      total_variable = (select coalesce(sum(gross_amount), 0) from payroll_items
                         where payroll_run_id = p_run_id
                           and payment_type in ('variable','bonus','vacation','thirteenth')),
      total_benefits = (select coalesce(sum(benefits), 0) from payroll_items
                         where payroll_run_id = p_run_id),
      total_charges = (select coalesce(sum(fgts + inss + irrf), 0) from payroll_items
                        where payroll_run_id = p_run_id),
      updated_at = now()
  where id = p_run_id;

  return query select v_count, v_total;
end;
$$;

grant execute on function public.post_payroll_run(uuid, uuid) to authenticated;

-- preview_payroll_posting: dry-run that returns what would be posted
create or replace function public.preview_payroll_posting(p_run_id uuid)
returns table (
  employee_name text,
  employee_kind employee_kind,
  component payroll_component,
  amount numeric,
  account_code text,
  account_name text,
  has_mapping boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_run payroll_runs%rowtype;
begin
  select * into v_run from payroll_runs where id = p_run_id;
  if not found then
    raise exception 'Payroll run não encontrado';
  end if;

  return query
  with components as (
    select pi.id as item_id, e.full_name, e.employee_kind,
           'salary_fixed'::payroll_component as component,
           case when pi.fixed_amount > 0 then pi.fixed_amount
                when pi.payment_type = 'fixed' and pi.variable_amount = 0
                 and pi.bonus_amount = 0 and pi.profit_sharing_amount = 0
                  then pi.gross_amount else 0 end as amount
    from payroll_items pi join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id
    union all
    select pi.id, e.full_name, e.employee_kind, 'salary_variable',
           case when pi.variable_amount > 0 then pi.variable_amount
                when pi.payment_type in ('variable','vacation','thirteenth','severance','adjustment')
                 and pi.fixed_amount = 0 and pi.bonus_amount = 0 and pi.profit_sharing_amount = 0
                  then pi.gross_amount else 0 end
    from payroll_items pi join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id
    union all
    select pi.id, e.full_name, e.employee_kind, 'salary_bonus',
           case when pi.bonus_amount + pi.profit_sharing_amount > 0
                  then pi.bonus_amount + pi.profit_sharing_amount
                when pi.payment_type = 'bonus' and pi.fixed_amount = 0 and pi.variable_amount = 0
                  then pi.gross_amount else 0 end
    from payroll_items pi join employees e on e.id = pi.employee_id
    where pi.payroll_run_id = p_run_id
    union all
    select pi.id, e.full_name, e.employee_kind, 'fgts', pi.fgts
    from payroll_items pi join employees e on e.id = pi.employee_id where pi.payroll_run_id = p_run_id
    union all
    select pi.id, e.full_name, e.employee_kind, 'benefits', pi.benefits
    from payroll_items pi join employees e on e.id = pi.employee_id where pi.payroll_run_id = p_run_id
    union all
    select pi.id, e.full_name, e.employee_kind, 'irrf_withheld', pi.irrf
    from payroll_items pi join employees e on e.id = pi.employee_id where pi.payroll_run_id = p_run_id
    union all
    select pi.id, e.full_name, e.employee_kind, 'inss_withheld', pi.inss
    from payroll_items pi join employees e on e.id = pi.employee_id where pi.payroll_run_id = p_run_id
  )
  select
    c.full_name,
    c.employee_kind,
    c.component,
    c.amount,
    ca.code,
    ca.name,
    pam.account_id is not null
  from components c
  left join payroll_account_mappings pam
    on pam.company_id = v_run.company_id
   and pam.employee_kind = c.employee_kind
   and pam.component = c.component
  left join chart_of_accounts ca on ca.id = pam.account_id
  where c.amount > 0.005
  order by c.full_name, c.component;
end;
$$;

grant execute on function public.preview_payroll_posting(uuid) to authenticated;
