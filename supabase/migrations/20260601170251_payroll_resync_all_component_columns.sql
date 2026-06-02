-- Restore the correct per-component re-sync function (the DEBUG version was a
-- temporary diagnostic) and widen the trigger so edits to withholdings
-- (inss, fgts, irrf) also re-sync their transaction legs.
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
        update transactions
        set deleted_at = now(), deleted_by = v_user_id, updated_at = now()
        where payroll_item_id = new.id
          and metadata->>'component' = r.component::text
          and deleted_at is null;
      end if;
    elsif r.amount > 0.005 then
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

drop trigger if exists trg_sync_payroll_item_transaction on public.payroll_items;
create trigger trg_sync_payroll_item_transaction
  after update of
    fixed_amount, variable_amount, bonus_amount, profit_sharing_amount,
    gross_amount, benefits, inss, fgts, irrf, notes
  on public.payroll_items
  for each row
  execute function public.sync_payroll_item_transaction();
