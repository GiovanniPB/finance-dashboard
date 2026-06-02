-- Backfill a single template: materialize all occurrences from current
-- next_run_date up to p_through_date (default hoje), independente de
-- auto_generate. Usado na criação pra cobrir templates retroativos.
create or replace function public.backfill_recurring_template(
  p_template_id uuid,
  p_through_date date default current_date
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  loop
    exit when (
      select rt.next_run_date > p_through_date
        or rt.is_active = false
        or (rt.end_date is not null and rt.next_run_date > rt.end_date)
        or (rt.max_occurrences is not null and rt.total_generated >= rt.max_occurrences)
      from recurring_templates rt where rt.id = p_template_id
    );
    perform materialize_recurring_occurrence(p_template_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.backfill_recurring_template(uuid, date) from public;
grant execute on function public.backfill_recurring_template(uuid, date) to authenticated;

