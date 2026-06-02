
create table recurring_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  account_id uuid not null references chart_of_accounts(id) on delete restrict,
  cost_center_id uuid references cost_centers(id) on delete set null,
  bank_account_id uuid references bank_accounts(id) on delete set null,
  counterparty_id uuid references counterparties(id) on delete set null,

  description text not null,
  amount numeric(18,2) not null check (amount > 0),
  direction transaction_direction not null,

  frequency recurrence_frequency not null,
  interval_count int not null default 1 check (interval_count >= 1),
  day_of_month int check (day_of_month between 1 and 31),
  day_of_week int check (day_of_week between 0 and 6),

  start_date date not null,
  end_date date,
  next_run_date date not null,
  last_generated_date date,
  total_generated int not null default 0,
  max_occurrences int,

  auto_generate boolean not null default true,    -- false = financeiro aprova cada geração
  is_active boolean not null default true,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger trg_rec_updated before update on recurring_templates
  for each row execute function set_updated_at();
create index idx_rec_next_run on recurring_templates(next_run_date) where is_active = true;
create index idx_rec_company on recurring_templates(company_id);

alter table transactions
  add constraint fk_tx_recurring foreign key (recurring_template_id)
  references recurring_templates(id) on delete set null;

