-- View v_bills: enriched view of AP/AR (open or recently settled) with computed
-- effective_status (overdue when due_date < today and not fully paid).
create or replace view public.v_bills as
select
  t.id,
  t.company_id,
  t.direction,
  t.status,
  t.amount,
  t.paid_amount,
  greatest(t.amount + t.interest_amount + t.fine_amount - t.discount_amount - t.paid_amount, 0) as open_amount,
  t.interest_amount,
  t.fine_amount,
  t.discount_amount,
  t.accrual_date,
  t.due_date,
  t.cash_date,
  t.description,
  t.document_ref,
  t.account_id,
  t.cost_center_id,
  t.bank_account_id,
  t.counterparty_id,
  t.installment_n,
  t.installment_total,
  t.parent_id,
  t.tags,
  t.notes,
  t.created_at,
  t.updated_at,
  case
    when t.status = 'canceled' then 'canceled'
    when t.status in ('settled', 'reconciled') then 'paid'
    when t.paid_amount > 0 and t.paid_amount < t.amount then 'partial'
    when t.due_date is not null and t.due_date < current_date then 'overdue'
    else 'open'
  end as effective_status,
  case
    when t.due_date is null then null
    else (current_date - t.due_date)::int
  end as days_overdue
from public.transactions t
where t.deleted_at is null;

comment on view public.v_bills is
  'Enriched bills view (AP+AR) with effective_status and days_overdue';

-- View v_bills_aging: aggregated buckets by company+direction
create or replace view public.v_bills_aging as
with bucketed as (
  select
    company_id,
    direction,
    open_amount,
    case
      when effective_status = 'paid' then 'paid'
      when effective_status = 'canceled' then 'canceled'
      when days_overdue is null or days_overdue < 0 then 'future'
      when days_overdue between 0 and 30 then 'b_0_30'
      when days_overdue between 31 and 60 then 'b_31_60'
      when days_overdue between 61 and 90 then 'b_61_90'
      else 'b_90_plus'
    end as bucket
  from public.v_bills
  where effective_status not in ('paid', 'canceled')
)
select
  company_id,
  direction,
  bucket,
  count(*)::int as count,
  coalesce(sum(open_amount), 0)::numeric as total
from bucketed
group by company_id, direction, bucket;

comment on view public.v_bills_aging is
  'Aging summary by aging bucket (future/0-30/31-60/61-90/90+)';

-- RPC create_installments: create N child transactions with parent_id link
-- Each child gets its own due_date (monthly add by default), shares all other fields.
create or replace function public.create_installments(
  p_template jsonb,
  p_installments int,
  p_interval_days int default null,
  p_first_due date default null
)
returns setof public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent transactions%rowtype;
  v_amount_each numeric;
  v_remainder numeric;
  v_due date;
  v_i int;
  v_row transactions%rowtype;
begin
  if p_installments < 1 then
    raise exception 'Installments must be >= 1' using errcode = 'invalid_parameter_value';
  end if;

  -- Insert parent (acts as the matrix; installments will reference it).
  insert into transactions (
    company_id, account_id, cost_center_id, bank_account_id, counterparty_id,
    amount, direction, status, accrual_date, due_date, description, document_ref,
    metadata, tags, notes, created_by
  )
  values (
    (p_template->>'company_id')::uuid,
    (p_template->>'account_id')::uuid,
    nullif(p_template->>'cost_center_id','')::uuid,
    nullif(p_template->>'bank_account_id','')::uuid,
    nullif(p_template->>'counterparty_id','')::uuid,
    (p_template->>'amount')::numeric,
    (p_template->>'direction')::transaction_direction,
    coalesce(nullif(p_template->>'status','')::transaction_status, 'pending'),
    coalesce((p_template->>'accrual_date')::date, current_date),
    coalesce(p_first_due, (p_template->>'due_date')::date, current_date),
    coalesce(p_template->>'description', 'Parcelado'),
    nullif(p_template->>'document_ref',''),
    coalesce(p_template->'metadata', '{}'::jsonb) || jsonb_build_object('is_installment_parent', true),
    coalesce(array(select jsonb_array_elements_text(p_template->'tags')), '{}'::text[]),
    nullif(p_template->>'notes',''),
    auth.uid()
  )
  returning * into v_parent;

  -- Compute per-installment amount (last one absorbs rounding remainder).
  v_amount_each := round(v_parent.amount / p_installments, 2);
  v_remainder := v_parent.amount - (v_amount_each * p_installments);

  for v_i in 1..p_installments loop
    if v_i = 1 then
      v_due := coalesce(p_first_due, v_parent.due_date, current_date);
    else
      v_due := v_due + coalesce(p_interval_days, 30);
    end if;

    insert into transactions (
      company_id, account_id, cost_center_id, bank_account_id, counterparty_id,
      amount, direction, status, accrual_date, due_date, description, document_ref,
      installment_n, installment_total, parent_id, metadata, tags, created_by
    )
    values (
      v_parent.company_id, v_parent.account_id, v_parent.cost_center_id,
      v_parent.bank_account_id, v_parent.counterparty_id,
      case when v_i = p_installments then v_amount_each + v_remainder else v_amount_each end,
      v_parent.direction, 'pending', v_parent.accrual_date, v_due,
      v_parent.description || ' (' || v_i || '/' || p_installments || ')',
      v_parent.document_ref,
      v_i, p_installments, v_parent.id,
      v_parent.metadata - 'is_installment_parent', v_parent.tags, auth.uid()
    )
    returning * into v_row;

    return next v_row;
  end loop;

  -- Mark parent as canceled (matrix only; only children are the real bills).
  update transactions set status = 'canceled' where id = v_parent.id;
end;
$$;

grant execute on function public.create_installments(jsonb, int, int, date) to authenticated;
comment on function public.create_installments(jsonb, int, int, date) is
  'Create N installment transactions linked to a parent matrix transaction. Parent is canceled (matrix only).';

-- RPC register_payment: register full or partial payment for a bill
create or replace function public.register_payment(
  p_transaction_id uuid,
  p_amount numeric,
  p_paid_at date default current_date,
  p_bank_account_id uuid default null,
  p_interest numeric default 0,
  p_fine numeric default 0,
  p_discount numeric default 0
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx transactions%rowtype;
  v_total_due numeric;
  v_new_paid numeric;
  v_new_status transaction_status;
begin
  select * into v_tx from transactions
   where id = p_transaction_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Lançamento não encontrado' using errcode = 'no_data_found';
  end if;

  if v_tx.status = 'canceled' then
    raise exception 'Lançamento cancelado não pode receber baixa' using errcode = 'invalid_parameter_value';
  end if;

  if p_amount <= 0 then
    raise exception 'Valor pago deve ser maior que zero' using errcode = 'invalid_parameter_value';
  end if;

  v_new_paid := v_tx.paid_amount + p_amount;
  v_total_due := v_tx.amount
               + greatest(v_tx.interest_amount, p_interest)
               + greatest(v_tx.fine_amount, p_fine)
               - greatest(v_tx.discount_amount, p_discount);

  if v_new_paid > v_total_due + 0.01 then
    raise exception 'Valor pago (%) excede o saldo devedor (%)', v_new_paid, v_total_due
      using errcode = 'invalid_parameter_value';
  end if;

  if v_new_paid >= v_total_due - 0.01 then
    v_new_status := 'settled';
  else
    v_new_status := 'pending';
  end if;

  update transactions set
    paid_amount     = v_new_paid,
    interest_amount = greatest(interest_amount, p_interest),
    fine_amount     = greatest(fine_amount, p_fine),
    discount_amount = greatest(discount_amount, p_discount),
    cash_date       = case when v_new_status = 'settled' then p_paid_at else cash_date end,
    bank_account_id = coalesce(p_bank_account_id, bank_account_id),
    status          = v_new_status,
    updated_at      = now()
  where id = p_transaction_id
  returning * into v_tx;

  return v_tx;
end;
$$;

grant execute on function public.register_payment(uuid, numeric, date, uuid, numeric, numeric, numeric) to authenticated;
comment on function public.register_payment(uuid, numeric, date, uuid, numeric, numeric, numeric) is
  'Register a (partial or full) payment against a bill. Auto-transitions status to settled when fully paid.';
