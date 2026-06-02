-- Enable pg_cron (idempotent if already exists)
create extension if not exists pg_cron with schema extensions;

-- Helper: advance a date by recurrence frequency (preserving day_of_month if set).
create or replace function public.advance_recurrence_date(
  p_current date,
  p_frequency text,
  p_day_of_month int default null
)
returns date
language plpgsql
immutable
as $$
declare
  v_next date;
begin
  case p_frequency
    when 'weekly'     then v_next := p_current + interval '7 days';
    when 'biweekly'   then v_next := p_current + interval '14 days';
    when 'monthly'    then v_next := p_current + interval '1 month';
    when 'quarterly'  then v_next := p_current + interval '3 months';
    when 'semiannual' then v_next := p_current + interval '6 months';
    when 'yearly'     then v_next := p_current + interval '1 year';
    else v_next := p_current + interval '1 month';
  end case;

  -- Snap to day_of_month if set (handles months with fewer days by clamping).
  if p_day_of_month is not null and p_frequency in ('monthly','quarterly','semiannual','yearly') then
    v_next := make_date(
      extract(year from v_next)::int,
      extract(month from v_next)::int,
      least(p_day_of_month, extract(day from (date_trunc('month', v_next) + interval '1 month - 1 day'))::int)
    );
  end if;

  return v_next;
end;
$$;

-- Materialize ONE occurrence of a template (used both by cron loop and manual approval).
create or replace function public.materialize_recurring_occurrence(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t recurring_templates;
  v_tx_id uuid;
begin
  select * into t from recurring_templates where id = p_template_id;
  if t.id is null then
    raise exception 'Template % não encontrado', p_template_id;
  end if;
  if not t.is_active then
    raise exception 'Template % está inativo', p_template_id;
  end if;
  if t.end_date is not null and t.next_run_date > t.end_date then
    raise exception 'Template % já encerrou em %', p_template_id, t.end_date;
  end if;
  if t.max_occurrences is not null and t.total_generated >= t.max_occurrences then
    raise exception 'Template % atingiu o limite de % ocorrências', p_template_id, t.max_occurrences;
  end if;

  insert into transactions (
    company_id, account_id, cost_center_id, bank_account_id, counterparty_id,
    amount, direction, status, accrual_date, description,
    recurring_template_id, created_by
  ) values (
    t.company_id, t.account_id, t.cost_center_id, t.bank_account_id, t.counterparty_id,
    t.amount, t.direction, 'scheduled', t.next_run_date, t.description,
    t.id, auth.uid()
  ) returning id into v_tx_id;

  update recurring_templates
  set
    last_generated_date = next_run_date,
    next_run_date = advance_recurrence_date(next_run_date, frequency::text, day_of_month),
    total_generated = total_generated + 1,
    updated_at = now()
  where id = t.id;

  return v_tx_id;
end;
$$;

-- Bulk auto-generator: processes ALL active+auto_generate templates whose next_run_date <= through_date.
-- Loops until each template is caught up (handles overdue templates).
create or replace function public.generate_recurring_transactions(
  p_through_date date default current_date
)
returns table (template_id uuid, generated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_count int;
begin
  for t in
    select id from recurring_templates
    where is_active = true
      and auto_generate = true
      and next_run_date <= p_through_date
      and (end_date is null or next_run_date <= end_date)
  loop
    v_count := 0;
    loop
      exit when (
        select rt.next_run_date > p_through_date
          or (rt.end_date is not null and rt.next_run_date > rt.end_date)
          or (rt.max_occurrences is not null and rt.total_generated >= rt.max_occurrences)
        from recurring_templates rt where rt.id = t.id
      );
      perform materialize_recurring_occurrence(t.id);
      v_count := v_count + 1;
    end loop;
    if v_count > 0 then
      template_id := t.id;
      generated_count := v_count;
      return next;
    end if;
  end loop;
end;
$$;

-- Single-shot for manual approval (any template, regardless of auto_generate flag).
create or replace function public.approve_recurring_template(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return materialize_recurring_occurrence(p_template_id);
end;
$$;

revoke all on function public.generate_recurring_transactions(date) from public;
revoke all on function public.approve_recurring_template(uuid) from public;
revoke all on function public.materialize_recurring_occurrence(uuid) from public;
revoke all on function public.advance_recurrence_date(date, text, int) from public;
grant execute on function public.generate_recurring_transactions(date) to authenticated;
grant execute on function public.approve_recurring_template(uuid) to authenticated;
grant execute on function public.advance_recurrence_date(date, text, int) to authenticated;

-- Schedule cron: every day at 06:00 UTC (03:00 America/Sao_Paulo)
-- Idempotent: unschedule previous job with same name if exists.
do $$
begin
  perform cron.unschedule('generate-recurring-daily')
  where exists (select 1 from cron.job where jobname = 'generate-recurring-daily');
exception when others then null;
end $$;

select cron.schedule(
  'generate-recurring-daily',
  '0 6 * * *',
  $cmd$ select public.generate_recurring_transactions(current_date); $cmd$
);

