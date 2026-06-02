-- suggest_match_candidates: given a statement line, return candidate
-- transactions ordered by a heuristic score (0-100).
--
-- Scoring:
--   +50 exact amount match
--   +25 amount within 1% tolerance
--   +30 date within ±3 days of posted_at
--   +15 date within ±7 days
--   +20 counterparty name appears in description
--   +10 document_ref matches
-- Capped at 100.

create or replace function public.suggest_match_candidates(
  p_line_id uuid,
  p_max int default 10
)
returns table (
  transaction_id uuid,
  score int,
  amount numeric,
  direction transaction_direction,
  due_date date,
  cash_date date,
  accrual_date date,
  description text,
  counterparty_name text,
  account_code text,
  account_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_line bank_statement_lines%rowtype;
  v_direction transaction_direction;
  v_abs numeric;
begin
  select * into v_line from bank_statement_lines where id = p_line_id;
  if not found then
    raise exception 'Statement line não encontrada' using errcode = 'no_data_found';
  end if;

  v_direction := case when v_line.amount >= 0 then 'inflow' else 'outflow' end;
  v_abs := abs(v_line.amount);

  return query
  with candidates as (
    select
      t.id,
      t.amount as t_amount,
      t.direction as t_direction,
      t.due_date as t_due,
      t.cash_date as t_cash,
      t.accrual_date as t_accrual,
      t.description as t_desc,
      t.document_ref as t_doc,
      c.name as cp_name,
      a.code as a_code,
      a.name as a_name,
      -- score components
      case
        when abs(t.amount - v_abs) < 0.01 then 50
        when abs(t.amount - v_abs) < v_abs * 0.01 then 25
        else 0
      end
      + case
        when abs(coalesce(t.cash_date, t.due_date, t.accrual_date) - v_line.posted_at) <= 3 then 30
        when abs(coalesce(t.cash_date, t.due_date, t.accrual_date) - v_line.posted_at) <= 7 then 15
        else 0
      end
      + case
        when c.name is not null
         and length(c.name) > 2
         and v_line.description ilike '%' || c.name || '%' then 20
        else 0
      end
      + case
        when t.document_ref is not null
         and t.document_ref <> ''
         and (v_line.document_ref = t.document_ref
              or v_line.description ilike '%' || t.document_ref || '%') then 10
        else 0
      end as raw_score
    from transactions t
    left join counterparties c on c.id = t.counterparty_id
    left join chart_of_accounts a on a.id = t.account_id
    where t.company_id = v_line.company_id
      and t.deleted_at is null
      and t.direction = v_direction
      and (
        -- not yet reconciled
        t.status <> 'reconciled'
        -- or already linked to this same line (idempotent re-query)
        or t.id = v_line.matched_transaction_id
      )
      and t.id not in (
        -- exclude transactions already matched to another statement line
        select sl.matched_transaction_id from bank_statement_lines sl
         where sl.matched_transaction_id is not null
           and sl.id <> v_line.id
      )
      -- pre-filter by amount/date window for performance
      and abs(t.amount - v_abs) <= greatest(v_abs * 0.05, 1)
      and abs(coalesce(t.cash_date, t.due_date, t.accrual_date) - v_line.posted_at) <= 30
  )
  select
    candidates.id as transaction_id,
    least(candidates.raw_score, 100)::int as score,
    candidates.t_amount as amount,
    candidates.t_direction as direction,
    candidates.t_due as due_date,
    candidates.t_cash as cash_date,
    candidates.t_accrual as accrual_date,
    candidates.t_desc as description,
    candidates.cp_name as counterparty_name,
    candidates.a_code as account_code,
    candidates.a_name as account_name
  from candidates
  where candidates.raw_score >= 30
  order by candidates.raw_score desc, abs(candidates.t_amount - v_abs) asc
  limit p_max;
end;
$$;

grant execute on function public.suggest_match_candidates(uuid, int) to authenticated;

-- match_statement_line: link a statement line to an existing transaction
create or replace function public.match_statement_line(
  p_line_id uuid,
  p_transaction_id uuid
)
returns bank_statement_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line bank_statement_lines%rowtype;
  v_tx transactions%rowtype;
begin
  select * into v_line from bank_statement_lines where id = p_line_id for update;
  if not found then
    raise exception 'Statement line não encontrada' using errcode = 'no_data_found';
  end if;

  if v_line.status <> 'unmatched' then
    raise exception 'Linha já foi processada (status=%)', v_line.status
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_tx from transactions
    where id = p_transaction_id and deleted_at is null for update;
  if not found then
    raise exception 'Lançamento não encontrado' using errcode = 'no_data_found';
  end if;

  if v_tx.company_id <> v_line.company_id then
    raise exception 'Lançamento e linha pertencem a empresas diferentes';
  end if;

  -- Check transaction not already matched elsewhere
  if exists (
    select 1 from bank_statement_lines
     where matched_transaction_id = p_transaction_id and id <> p_line_id
  ) then
    raise exception 'Este lançamento já foi conciliado com outra linha';
  end if;

  update transactions set
    status = 'reconciled',
    cash_date = coalesce(cash_date, v_line.posted_at),
    bank_account_id = coalesce(bank_account_id, v_line.bank_account_id),
    updated_at = now()
  where id = p_transaction_id;

  update bank_statement_lines set
    status = 'matched',
    matched_transaction_id = p_transaction_id,
    matched_by = auth.uid(),
    matched_at = now()
  where id = p_line_id
  returning * into v_line;

  return v_line;
end;
$$;

grant execute on function public.match_statement_line(uuid, uuid) to authenticated;

-- unmatch_statement_line: revert a previous match (does not auto-revert
-- the transaction status; user should re-edit if needed)
create or replace function public.unmatch_statement_line(p_line_id uuid)
returns bank_statement_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line bank_statement_lines%rowtype;
begin
  select * into v_line from bank_statement_lines where id = p_line_id for update;
  if not found then
    raise exception 'Statement line não encontrada';
  end if;
  if v_line.status <> 'matched' then
    raise exception 'Linha não está conciliada';
  end if;

  -- Revert linked transaction to settled (was reconciled)
  if v_line.matched_transaction_id is not null then
    update transactions set
      status = case when status = 'reconciled' then 'settled'::transaction_status else status end,
      updated_at = now()
    where id = v_line.matched_transaction_id;
  end if;

  update bank_statement_lines set
    status = 'unmatched',
    matched_transaction_id = null,
    matched_by = null,
    matched_at = null
  where id = p_line_id
  returning * into v_line;

  return v_line;
end;
$$;

grant execute on function public.unmatch_statement_line(uuid) to authenticated;

-- ignore_statement_line: user decided this line doesn't correspond to any
-- transaction (e.g., bank fee already in another account, transfer)
create or replace function public.ignore_statement_line(p_line_id uuid)
returns bank_statement_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line bank_statement_lines%rowtype;
begin
  update bank_statement_lines set status = 'ignored', matched_at = now(), matched_by = auth.uid()
   where id = p_line_id and status = 'unmatched'
   returning * into v_line;
  if not found then
    raise exception 'Linha não encontrada ou já processada';
  end if;
  return v_line;
end;
$$;

grant execute on function public.ignore_statement_line(uuid) to authenticated;

-- create_transaction_from_line: when no match exists, promote the line to a
-- new transaction (filled with minimum fields; user can edit later).
create or replace function public.create_transaction_from_line(
  p_line_id uuid,
  p_account_id uuid,
  p_counterparty_id uuid default null,
  p_cost_center_id uuid default null
)
returns transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line bank_statement_lines%rowtype;
  v_tx transactions%rowtype;
  v_dir transaction_direction;
begin
  select * into v_line from bank_statement_lines where id = p_line_id for update;
  if not found then
    raise exception 'Statement line não encontrada';
  end if;
  if v_line.status <> 'unmatched' then
    raise exception 'Linha já foi processada';
  end if;

  v_dir := case when v_line.amount >= 0 then 'inflow' else 'outflow' end;

  insert into transactions (
    company_id, account_id, cost_center_id, bank_account_id, counterparty_id,
    amount, direction, status, accrual_date, cash_date, description, document_ref,
    created_by
  )
  values (
    v_line.company_id, p_account_id, p_cost_center_id, v_line.bank_account_id,
    p_counterparty_id,
    abs(v_line.amount), v_dir, 'reconciled', v_line.posted_at, v_line.posted_at,
    v_line.description, v_line.document_ref, auth.uid()
  )
  returning * into v_tx;

  update bank_statement_lines set
    status = 'created',
    matched_transaction_id = v_tx.id,
    matched_by = auth.uid(),
    matched_at = now()
  where id = p_line_id;

  return v_tx;
end;
$$;

grant execute on function public.create_transaction_from_line(uuid, uuid, uuid, uuid) to authenticated;
