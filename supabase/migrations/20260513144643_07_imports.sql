
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  filename text not null,
  source text not null default 'csv' check (source in ('csv','xlsx','ofx','manual')),
  status import_status not null default 'uploaded',
  column_mapping jsonb,
  row_count int not null default 0,
  committed_count int not null default 0,
  failed_count int not null default 0,
  error_log jsonb,
  storage_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger trg_imp_updated before update on import_batches
  for each row execute function set_updated_at();
create index idx_imp_company on import_batches(company_id);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references import_batches(id) on delete cascade,
  row_number int not null,
  raw_data jsonb not null,
  parsed jsonb,
  validation_errors jsonb,
  is_valid boolean not null default false,
  transaction_id uuid references transactions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_imp_rows_batch on import_rows(import_batch_id);
create index idx_imp_rows_valid on import_rows(import_batch_id, is_valid);

alter table transactions
  add constraint fk_tx_import foreign key (import_batch_id)
  references import_batches(id) on delete set null;

