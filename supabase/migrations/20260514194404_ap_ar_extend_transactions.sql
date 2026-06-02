-- Extend transactions with AP/AR lifecycle fields.
-- Strategy: keep a single source of truth (transactions) instead of forking a new
-- bills table. AP = direction='outflow', AR = direction='inflow'.

alter table public.transactions
  add column paid_amount      numeric not null default 0 check (paid_amount >= 0),
  add column installment_n     integer check (installment_n is null or installment_n >= 1),
  add column installment_total integer check (installment_total is null or installment_total >= 1),
  add column parent_id         uuid references public.transactions(id) on delete cascade,
  add column interest_amount   numeric not null default 0 check (interest_amount >= 0),
  add column fine_amount       numeric not null default 0 check (fine_amount >= 0),
  add column discount_amount   numeric not null default 0 check (discount_amount >= 0);

-- Installment consistency: either both null or both set with n<=total
alter table public.transactions
  add constraint transactions_installment_consistency check (
    (installment_n is null and installment_total is null) or
    (installment_n is not null and installment_total is not null and installment_n <= installment_total)
  );

-- paid_amount never exceeds amount + interest + fine - discount
alter table public.transactions
  add constraint transactions_paid_amount_cap check (
    paid_amount <= amount + interest_amount + fine_amount - discount_amount + 0.01
  );

create index if not exists transactions_due_date_idx
  on public.transactions(due_date) where deleted_at is null;
create index if not exists transactions_parent_id_idx
  on public.transactions(parent_id) where parent_id is not null;
create index if not exists transactions_bills_idx
  on public.transactions(company_id, direction, status, due_date)
  where deleted_at is null and status in ('scheduled', 'pending');

comment on column public.transactions.paid_amount is 'Total already paid/received (supports partial settlement)';
comment on column public.transactions.installment_n is 'Current installment number (1..total)';
comment on column public.transactions.installment_total is 'Total installments for this parent';
comment on column public.transactions.parent_id is 'Parent transaction when this row is an installment';
comment on column public.transactions.interest_amount is 'Interest accrued on late payment';
comment on column public.transactions.fine_amount is 'Fine applied on late payment';
comment on column public.transactions.discount_amount is 'Discount granted on payment';
