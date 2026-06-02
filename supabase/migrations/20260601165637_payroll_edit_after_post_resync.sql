-- 1) Remember the fallback account used at post time, so edits that introduce
--    a previously-zero component can resolve an account for the new leg.
alter table public.payroll_runs
  add column if not exists posted_default_account_id uuid references public.chart_of_accounts(id);

-- 2) Store the fallback account when posting.
create or replace function public.post_payroll_run(p_run_id uuid, p_default_account_id uuid)
 returns table(generated_count integer, total_amount numeric)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  with components as (
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
      posted_default_account_id = p_default_account_id,
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
$function$;

-- 3) Re-sync each component leg when a posted item is edited.
create or replace function public.sync_payroll_item_transaction()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_run payroll_runs%rowtype;
  v_employee employees%rowtype;
  v_competence_date date;
  v_user_id uuid;
  r record;
  v_exists boolean;
begin
  select * into v_run from payroll_runs where id = new.payroll_run_id;
  -- Drafts have no generated transactions yet; nothing to sync.
  if v_run.status is distinct from 'posted' then
    return new;
  end if;

  select * into v_employee from employees where id = new.employee_id;
  v_user_id := auth.uid();
  v_competence_date := (date_trunc('month', v_run.reference_month) + interval '1 month - 1 day')::date;

  for r in
    with components as (
      select 'salary_fixed'::payroll_component as component,
             case
               when new.fixed_amount > 0 then new.fixed_amount
               when new.payment_type = 'fixed'
                and new.variable_amount = 0 and new.bonus_amount = 0
                and new.profit_sharing_amount = 0 then new.gross_amount
               else 0
             end as amount
      union all
      select 'salary_variable'::payroll_component,
             case
               when new.variable_amount > 0 then new.variable_amount
               when new.payment_type in ('variable','vacation','thirteenth','severance','adjustment')
                and new.fixed_amount = 0 and new.bonus_amount = 0
                and new.profit_sharing_amount = 0 then new.gross_amount
               else 0
             end
      union all
      select 'salary_bonus'::payroll_component,
             case
               when new.bonus_amount + new.profit_sharing_amount > 0
                 then new.bonus_amount + new.profit_sharing_amount
               when new.payment_type = 'bonus' and new.fixed_amount = 0
                and new.variable_amount = 0 then new.gross_amount
               else 0
             end
      union all select 'fgts'::payroll_component, new.fgts
      union all select 'benefits'::payroll_component, new.benefits
      union all select 'irrf_withheld'::payroll_component, new.irrf
      union all select 'inss_withheld'::payroll_component, new.inss
    )
    select component, amount from components
  loop
    select exists (
      select 1 from transactions
      where payroll_item_id = new.id
        and metadata->>'component' = r.component::text
        and deleted_at is null
    ) into v_exists;

    if v_exists then
      if r.amount > 0.005 then
        update transactions
        set amount = r.amount,
            accrual_date = v_competence_date,
            cash_date = v_competence_date,
            updated_at = now()
        where payroll_item_id = new.id
          and metadata->>'component' = r.component::text
          and deleted_at is null;
      else
        -- Component zeroed out: retire its transaction.
        update transactions
        set deleted_at = now(), deleted_by = v_user_id, updated_at = now()
        where payroll_item_id = new.id
          and metadata->>'component' = r.component::text
          and deleted_at is null;
      end if;
    elsif r.amount > 0.005 then
      -- Component became non-zero after posting: create its leg, resolving the
      -- account from the mapping or the run's stored fallback account.
      insert into transactions (
        company_id, account_id, cost_center_id, amount, direction, status,
        accrual_date, cash_date, description, created_by, payroll_item_id, metadata
      )
      select
        v_run.company_id,
        coalesce(pam.account_id, v_run.posted_default_account_id),
        coalesce(pam.cost_center_id, v_employee.cost_center_id),
        r.amount, 'outflow', 'settled',
        v_competence_date, v_competence_date,
        'Folha ' || to_char(v_run.reference_month, 'YYYY-MM')
          || ' · ' || v_employee.full_name
          || ' · ' || r.component::text,
        v_user_id, new.id,
        jsonb_build_object(
          'source', 'payroll_post',
          'payroll_run_id', v_run.id,
          'reference_month', v_run.reference_month,
          'payment_type', new.payment_type,
          'component', r.component
        )
      from (select 1) one
      left join payroll_account_mappings pam
        on pam.company_id = v_run.company_id
       and pam.employee_kind = v_employee.employee_kind
       and pam.component = r.component
      where coalesce(pam.account_id, v_run.posted_default_account_id) is not null;
    end if;
  end loop;

  return new;
end;
$function$;
