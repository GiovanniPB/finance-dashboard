create or replace function public.delete_employee(p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payroll_count int;
begin
  select count(*) into v_payroll_count
  from payroll_items
  where employee_id = p_employee_id;

  if v_payroll_count > 0 then
    raise exception 'Colaborador possui % item(ns) em folha(s). Exclua as folhas antes ou use desativar.', v_payroll_count
      using errcode = 'foreign_key_violation';
  end if;

  delete from employees where id = p_employee_id;
end;
$$;

revoke all on function public.delete_employee(uuid) from public;
grant execute on function public.delete_employee(uuid) to authenticated;

