
-- bank_accounts (BTG, C6 corrente, CDBs etc)
create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  bank_name text not null,                 -- "BTG Pactual", "C6 Bank"
  account_type bank_account_type not null,
  nickname text not null,                  -- "BTG conta remunerada", "C6 CDB Resgate Automático"
  agency text,
  account_number text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  initial_balance numeric(18,2) not null default 0,
  initial_balance_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, nickname)
);
create trigger trg_ba_updated before update on bank_accounts
  for each row execute function set_updated_at();
create index idx_ba_company on bank_accounts(company_id);

-- cash balance snapshots por mês (para histórico do "Saldo início/fim")
create table cash_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_accounts(id) on delete cascade,
  reference_month date not null,            -- primeiro dia do mês
  opening_balance numeric(18,2) not null,
  total_inflow numeric(18,2) not null default 0,
  total_outflow numeric(18,2) not null default 0,
  closing_balance numeric(18,2) not null,
  is_reconciled boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_account_id, reference_month)
);
create trigger trg_cbs_updated before update on cash_balance_snapshots
  for each row execute function set_updated_at();
create index idx_cbs_account on cash_balance_snapshots(bank_account_id);
create index idx_cbs_month on cash_balance_snapshots(reference_month);

