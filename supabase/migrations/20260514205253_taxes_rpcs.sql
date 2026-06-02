-- Simples Nacional Anexo III (serviços) - tabela 2025 baseada na LC 123/06.
-- Faixa: receita bruta acumulada 12 meses (RBT12).
-- Aliquota efetiva = (RBT12 * aliquota_nominal - valor_deduzir) / RBT12
--
-- Faixas Anexo III:
--   até R$ 180.000,00      6,00%   0
--   até R$ 360.000,00     11,20%   9.360
--   até R$ 720.000,00     13,50%   17.640
--   até R$ 1.800.000,00   16,00%   35.640
--   até R$ 3.600.000,00   21,00%   125.640
--   até R$ 4.800.000,00   33,00%   648.000

create or replace function public.calculate_simples_anexo_iii(
  p_rbt12 numeric,
  p_period_revenue numeric
)
returns table (
  rbt12 numeric,
  period_revenue numeric,
  nominal_rate numeric,
  deduction numeric,
  effective_rate numeric,
  amount_due numeric
)
language plpgsql
immutable
as $$
declare
  v_nominal numeric;
  v_deduction numeric;
  v_effective numeric;
begin
  if p_rbt12 < 0 or p_period_revenue < 0 then
    raise exception 'Valores não podem ser negativos';
  end if;

  if p_rbt12 <= 180000 then
    v_nominal := 6.00; v_deduction := 0;
  elsif p_rbt12 <= 360000 then
    v_nominal := 11.20; v_deduction := 9360;
  elsif p_rbt12 <= 720000 then
    v_nominal := 13.50; v_deduction := 17640;
  elsif p_rbt12 <= 1800000 then
    v_nominal := 16.00; v_deduction := 35640;
  elsif p_rbt12 <= 3600000 then
    v_nominal := 21.00; v_deduction := 125640;
  else
    v_nominal := 33.00; v_deduction := 648000;
  end if;

  if p_rbt12 = 0 then
    v_effective := v_nominal;
  else
    v_effective := ((p_rbt12 * v_nominal / 100) - v_deduction) / p_rbt12 * 100;
    if v_effective < 0 then v_effective := 0; end if;
  end if;

  return query
  select
    p_rbt12,
    p_period_revenue,
    v_nominal,
    v_deduction,
    round(v_effective, 4),
    round(p_period_revenue * v_effective / 100, 2);
end;
$$;

grant execute on function public.calculate_simples_anexo_iii(numeric, numeric) to authenticated;

-- compute_rbt12: revenue (kind=revenue) for the company in the 12 months ending
-- at the end of the reference period.
create or replace function public.compute_company_rbt12(
  p_company_id uuid,
  p_reference_period date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (date_trunc('month', p_reference_period) - interval '12 months')::date as from_date,
      (date_trunc('month', p_reference_period) - interval '1 day')::date     as to_date
  )
  select coalesce(sum(t.amount), 0)
  from transactions t
  join chart_of_accounts a on a.id = t.account_id
  cross join bounds b
  where t.company_id = p_company_id
    and t.deleted_at is null
    and t.status in ('settled', 'reconciled')
    and t.direction = 'inflow'
    and a.kind = 'revenue'
    and t.accrual_date between b.from_date and b.to_date;
$$;

grant execute on function public.compute_company_rbt12(uuid, date) to authenticated;

-- compute_period_revenue: revenue for one month
create or replace function public.compute_company_period_revenue(
  p_company_id uuid,
  p_reference_period date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(t.amount), 0)
  from transactions t
  join chart_of_accounts a on a.id = t.account_id
  where t.company_id = p_company_id
    and t.deleted_at is null
    and t.status in ('settled', 'reconciled')
    and t.direction = 'inflow'
    and a.kind = 'revenue'
    and t.accrual_date between date_trunc('month', p_reference_period)::date
                           and (date_trunc('month', p_reference_period) + interval '1 month' - interval '1 day')::date;
$$;

grant execute on function public.compute_company_period_revenue(uuid, date) to authenticated;

-- generate_tax_obligations: idempotent upsert of typical monthly obligations
-- based on the company's tax_regime. Auto-computes DAS Simples when applicable.
create or replace function public.generate_tax_obligations(
  p_company_id uuid,
  p_reference_period date
)
returns setof public.tax_obligations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company companies%rowtype;
  v_ref date := date_trunc('month', p_reference_period)::date;
  v_rbt12 numeric;
  v_period_revenue numeric;
  v_simples record;
  v_due_20 date := (v_ref + interval '1 month' + interval '19 days')::date;
  v_due_7  date := (v_ref + interval '1 month' + interval '6 days')::date;
begin
  select * into v_company from companies where id = p_company_id;
  if not found then
    raise exception 'Empresa não encontrada' using errcode = 'no_data_found';
  end if;

  if v_company.tax_regime = 'simples' then
    v_rbt12 := compute_company_rbt12(p_company_id, v_ref);
    v_period_revenue := compute_company_period_revenue(p_company_id, v_ref);
    select * into v_simples from calculate_simples_anexo_iii(v_rbt12, v_period_revenue);

    insert into tax_obligations (
      company_id, kind, reference_period, due_date,
      amount_estimated, base_amount, rate_pct,
      metadata, created_by
    )
    values (
      p_company_id, 'das_simples', v_ref, v_due_20,
      v_simples.amount_due, v_period_revenue, v_simples.effective_rate,
      jsonb_build_object(
        'anexo', 'III',
        'rbt12', v_rbt12,
        'nominal_rate', v_simples.nominal_rate,
        'deduction', v_simples.deduction
      ),
      auth.uid()
    )
    on conflict (company_id, kind, reference_period) do update set
      amount_estimated = excluded.amount_estimated,
      base_amount      = excluded.base_amount,
      rate_pct         = excluded.rate_pct,
      metadata         = excluded.metadata,
      updated_at       = now()
      where tax_obligations.status = 'pending';
  end if;

  if v_company.tax_regime in ('lucro_presumido', 'lucro_real') then
    -- PIS/COFINS monthly (presumed: 0.65% + 3% on revenue; real: 1.65% + 7.6% non-cumulative)
    v_period_revenue := compute_company_period_revenue(p_company_id, v_ref);

    insert into tax_obligations (
      company_id, kind, reference_period, due_date,
      amount_estimated, base_amount, rate_pct, metadata, created_by
    ) values (
      p_company_id, 'darf_pis', v_ref, v_due_20,
      round(v_period_revenue * (case v_company.tax_regime when 'lucro_presumido' then 0.0065 else 0.0165 end), 2),
      v_period_revenue,
      case v_company.tax_regime when 'lucro_presumido' then 0.65 else 1.65 end,
      jsonb_build_object('regime', v_company.tax_regime),
      auth.uid()
    )
    on conflict (company_id, kind, reference_period) do update set
      amount_estimated = excluded.amount_estimated, base_amount = excluded.base_amount,
      rate_pct = excluded.rate_pct, updated_at = now()
      where tax_obligations.status = 'pending';

    insert into tax_obligations (
      company_id, kind, reference_period, due_date,
      amount_estimated, base_amount, rate_pct, metadata, created_by
    ) values (
      p_company_id, 'darf_cofins', v_ref, v_due_20,
      round(v_period_revenue * (case v_company.tax_regime when 'lucro_presumido' then 0.03 else 0.076 end), 2),
      v_period_revenue,
      case v_company.tax_regime when 'lucro_presumido' then 3.00 else 7.60 end,
      jsonb_build_object('regime', v_company.tax_regime),
      auth.uid()
    )
    on conflict (company_id, kind, reference_period) do update set
      amount_estimated = excluded.amount_estimated, base_amount = excluded.base_amount,
      rate_pct = excluded.rate_pct, updated_at = now()
      where tax_obligations.status = 'pending';
  end if;

  -- FGTS (CLT-based) — due on the 7th of the next month
  -- We add a placeholder obligation but don't auto-compute (depends on payroll)
  insert into tax_obligations (
    company_id, kind, reference_period, due_date,
    amount_estimated, metadata, created_by
  ) values (
    p_company_id, 'fgts', v_ref, v_due_7, 0,
    jsonb_build_object('note', 'Calcule a partir da folha de pagamento'), auth.uid()
  )
  on conflict (company_id, kind, reference_period) do nothing;

  -- GPS / INSS empresa — due on the 20th
  insert into tax_obligations (
    company_id, kind, reference_period, due_date,
    amount_estimated, metadata, created_by
  ) values (
    p_company_id, 'gps_inss', v_ref, v_due_20, 0,
    jsonb_build_object('note', 'Calcule a partir da folha de pagamento'), auth.uid()
  )
  on conflict (company_id, kind, reference_period) do nothing;

  return query
  select * from tax_obligations
   where company_id = p_company_id and reference_period = v_ref
   order by due_date;
end;
$$;

grant execute on function public.generate_tax_obligations(uuid, date) to authenticated;

-- mark_tax_paid: register payment of an obligation. Creates a corresponding
-- transaction (outflow) that ties into DRE/cashflow/conciliation.
create or replace function public.mark_tax_paid(
  p_obligation_id uuid,
  p_paid_at date,
  p_bank_account_id uuid,
  p_account_id uuid,
  p_actual_amount numeric default null
)
returns tax_obligations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ob tax_obligations%rowtype;
  v_tx transactions%rowtype;
  v_amount numeric;
  v_desc text;
begin
  select * into v_ob from tax_obligations where id = p_obligation_id for update;
  if not found then
    raise exception 'Obrigação não encontrada';
  end if;
  if v_ob.status = 'paid' then
    raise exception 'Obrigação já está paga';
  end if;

  v_amount := coalesce(p_actual_amount, v_ob.amount_estimated);
  v_desc := 'Imposto: ' || v_ob.kind::text || ' · '
         || to_char(v_ob.reference_period, 'MM/YYYY');

  insert into transactions (
    company_id, account_id, bank_account_id,
    amount, direction, status, accrual_date, cash_date,
    description, created_by
  ) values (
    v_ob.company_id, p_account_id, p_bank_account_id,
    v_amount, 'outflow', 'settled', v_ob.reference_period, p_paid_at,
    v_desc, auth.uid()
  )
  returning * into v_tx;

  update tax_obligations set
    status         = 'paid',
    amount_paid    = v_amount,
    paid_at        = p_paid_at,
    transaction_id = v_tx.id,
    updated_at     = now()
  where id = p_obligation_id
  returning * into v_ob;

  return v_ob;
end;
$$;

grant execute on function public.mark_tax_paid(uuid, date, uuid, uuid, numeric) to authenticated;

-- Mark overdue obligations automatically (utility called from frontend)
create or replace function public.mark_overdue_obligations(p_company_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update tax_obligations
     set status = 'overdue', updated_at = now()
   where company_id = p_company_id
     and status = 'pending'
     and due_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_overdue_obligations(uuid) to authenticated;
