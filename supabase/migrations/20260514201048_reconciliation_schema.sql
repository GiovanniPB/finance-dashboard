-- Bank statement lines: rows from a bank feed (OFX/CSV) awaiting reconciliation
-- against existing transactions. Stays separate from transactions so we don't
-- create duplicate AP/AR rows.

create type public.statement_line_status as enum (
  'unmatched',  -- newly imported, no match yet
  'matched',    -- linked to an existing transaction
  'created',    -- transaction was created from this line
  'ignored'     -- user marked as irrelevant
);

create table public.bank_statement_lines (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  bank_account_id       uuid not null references public.bank_accounts(id) on delete cascade,
  posted_at             date not null,
  amount                numeric not null,   -- signed: positive=credit/inflow, negative=debit/outflow
  description           text not null,
  fit_id                text,               -- OFX FITID (bank's unique transaction id)
  document_ref          text,
  balance_after         numeric,            -- running balance if provided by bank
  raw                   jsonb not null default '{}',
  status                public.statement_line_status not null default 'unmatched',
  matched_transaction_id uuid references public.transactions(id) on delete set null,
  matched_by            uuid references auth.users(id) on delete set null,
  matched_at            timestamptz,
  import_source         text not null default 'manual', -- 'ofx' | 'csv' | 'manual'
  import_batch_id       uuid,
  notes                 text,
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null
);

-- Deduplication: same FITID for same bank account is the same transaction.
create unique index bank_statement_lines_fit_uidx
  on public.bank_statement_lines(bank_account_id, fit_id)
  where fit_id is not null;

create index bank_statement_lines_status_idx
  on public.bank_statement_lines(company_id, status, posted_at desc);
create index bank_statement_lines_bank_idx
  on public.bank_statement_lines(bank_account_id, posted_at desc);
create index bank_statement_lines_matched_idx
  on public.bank_statement_lines(matched_transaction_id)
  where matched_transaction_id is not null;

alter table public.bank_statement_lines enable row level security;

create policy "Read statement lines"
  on public.bank_statement_lines for select to authenticated
  using (has_company_access(company_id));

create policy "Insert statement lines"
  on public.bank_statement_lines for insert to authenticated
  with check (has_company_access(company_id));

create policy "Update statement lines"
  on public.bank_statement_lines for update to authenticated
  using (has_company_access(company_id));

create policy "Delete statement lines"
  on public.bank_statement_lines for delete to authenticated
  using (has_company_access(company_id));

comment on table public.bank_statement_lines is
  'Bank feed lines (from OFX/CSV) awaiting reconciliation against transactions';
