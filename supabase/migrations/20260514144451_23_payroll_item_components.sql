-- Decompose payroll_items.gross_amount into 4 manual components:
-- fixed (salário do cargo), variable (comissão/atingimento), bonus (extras), profit_sharing (PL).
-- gross_amount becomes a derived sum, maintained by trigger.

alter table public.payroll_items
  add column if not exists fixed_amount numeric not null default 0
    check (fixed_amount >= 0),
  add column if not exists variable_amount numeric not null default 0
    check (variable_amount >= 0),
  add column if not exists bonus_amount numeric not null default 0
    check (bonus_amount >= 0),
  add column if not exists profit_sharing_amount numeric not null default 0
    check (profit_sharing_amount >= 0);

-- Backfill: existing rows' gross_amount becomes fixed_amount.
update public.payroll_items
set fixed_amount = gross_amount
where fixed_amount = 0 and gross_amount > 0;

-- gross_amount is now derived = fixed + variable + bonus + profit_sharing.
-- Cannot use generated column because net_amount + employer_cost already depend on gross_amount.
-- Use BEFORE INSERT/UPDATE trigger instead.
create or replace function public.compute_payroll_item_gross()
returns trigger
language plpgsql
as $$
begin
  new.gross_amount := coalesce(new.fixed_amount, 0)
                    + coalesce(new.variable_amount, 0)
                    + coalesce(new.bonus_amount, 0)
                    + coalesce(new.profit_sharing_amount, 0);
  return new;
end;
$$;

drop trigger if exists trg_compute_payroll_item_gross on public.payroll_items;
create trigger trg_compute_payroll_item_gross
  before insert or update of fixed_amount, variable_amount, bonus_amount, profit_sharing_amount, gross_amount
  on public.payroll_items
  for each row
  execute function public.compute_payroll_item_gross();

-- Update sync trigger to also fire when any component changes.
drop trigger if exists trg_sync_payroll_item_transaction on public.payroll_items;
create trigger trg_sync_payroll_item_transaction
  after update of fixed_amount, variable_amount, bonus_amount, profit_sharing_amount,
                  gross_amount, benefits, notes
  on public.payroll_items
  for each row
  execute function public.sync_payroll_item_transaction();

-- Update create_payroll_run_with_active_employees: seed fixed_amount with base_salary
-- (gross_amount fica derivado via trigger).
create or replace function public.create_payroll_run_with_active_employees(
  p_company_id uuid,
  p_reference_month date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  insert into payroll_runs (company_id, reference_month, status, created_by)
  values (p_company_id, p_reference_month, 'draft', auth.uid())
  returning id into v_run_id;

  insert into payroll_items (payroll_run_id, employee_id, payment_type, fixed_amount)
  select v_run_id, e.id, 'fixed'::payroll_payment_type, e.base_salary
  from employees e
  where e.company_id = p_company_id
    and e.status = 'active'
    and e.deleted_at is null;

  return v_run_id;
end;
$$;

revoke all on function public.create_payroll_run_with_active_employees(uuid, date) from public;
grant execute on function public.create_payroll_run_with_active_employees(uuid, date) to authenticated;

