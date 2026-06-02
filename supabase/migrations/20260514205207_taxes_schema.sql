-- Tax obligations: scheduled tax payments per company per period.

create type public.tax_obligation_kind as enum (
  'das_simples',
  'darf_irpj',
  'darf_csll',
  'darf_pis',
  'darf_cofins',
  'gps_inss',
  'fgts',
  'icms',
  'iss',
  'irrf_retencao',
  'inss_retencao',
  'custom'
);

create type public.tax_obligation_status as enum (
  'pending',
  'paid',
  'overdue',
  'waived'
);

create table public.tax_obligations (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  kind                public.tax_obligation_kind not null,
  reference_period    date not null,  -- 1st day of the competence month
  due_date            date not null,
  amount_estimated    numeric not null default 0 check (amount_estimated >= 0),
  amount_paid         numeric not null default 0 check (amount_paid >= 0),
  status              public.tax_obligation_status not null default 'pending',
  paid_at             date,
  transaction_id      uuid references public.transactions(id) on delete set null,
  base_amount         numeric,        -- e.g., revenue base used for Simples calc
  rate_pct            numeric,        -- effective rate applied
  notes               text,
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

create unique index tax_obligations_uidx
  on public.tax_obligations(company_id, kind, reference_period);
create index tax_obligations_due_idx
  on public.tax_obligations(company_id, due_date)
  where status in ('pending', 'overdue');

alter table public.tax_obligations enable row level security;

create policy "Read tax obligations"
  on public.tax_obligations for select to authenticated
  using (has_company_access(company_id));
create policy "Insert tax obligations"
  on public.tax_obligations for insert to authenticated
  with check (has_company_access(company_id));
create policy "Update tax obligations"
  on public.tax_obligations for update to authenticated
  using (has_company_access(company_id));
create policy "Delete tax obligations"
  on public.tax_obligations for delete to authenticated
  using (has_company_access(company_id));

comment on table public.tax_obligations is
  'Scheduled tax payments per company per reference period';
