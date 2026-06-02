
-- counterparties (clientes/fornecedores/funcionários para reembolso)
create table counterparties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  document text,
  kind text check (kind in ('customer','supplier','employee','partner','government','other')),
  email text,
  phone text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_cp_updated before update on counterparties
  for each row execute function set_updated_at();
create index idx_cp_org on counterparties(organization_id);
create index idx_cp_kind on counterparties(kind);

-- transactions
create table transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  account_id uuid not null references chart_of_accounts(id) on delete restrict,
  cost_center_id uuid references cost_centers(id) on delete set null,
  bank_account_id uuid references bank_accounts(id) on delete set null,
  counterparty_id uuid references counterparties(id) on delete set null,

  amount numeric(18,2) not null check (amount > 0),
  direction transaction_direction not null,
  status transaction_status not null default 'pending',

  accrual_date date not null,
  cash_date date,
  due_date date,

  description text not null,
  document_ref text,

  recurring_template_id uuid,
  payroll_item_id uuid,
  import_batch_id uuid,

  metadata jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);
create trigger trg_tx_updated before update on transactions
  for each row execute function set_updated_at();

-- índices críticos
create index idx_tx_company_accrual on transactions(company_id, accrual_date) where deleted_at is null;
create index idx_tx_company_cash on transactions(company_id, cash_date) where deleted_at is null and cash_date is not null;
create index idx_tx_account on transactions(account_id) where deleted_at is null;
create index idx_tx_cost_center on transactions(cost_center_id) where cost_center_id is not null;
create index idx_tx_bank on transactions(bank_account_id) where bank_account_id is not null;
create index idx_tx_status on transactions(status) where deleted_at is null;
create index idx_tx_recurring on transactions(recurring_template_id) where recurring_template_id is not null;
create index idx_tx_due on transactions(due_date) where due_date is not null and status in ('scheduled','pending');

-- audit_log
create table audit_log (
  id bigserial primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
create index idx_audit_record on audit_log(table_name, record_id);
create index idx_audit_changed_at on audit_log(changed_at desc);
create index idx_audit_user on audit_log(changed_by) where changed_by is not null;

create or replace function audit_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  changed text[] := '{}';
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select key from jsonb_each(to_jsonb(new)) loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k)
         and k not in ('updated_at') then
        changed := array_append(changed, k);
      end if;
    end loop;
    if array_length(changed,1) is null then return new; end if;
  end if;

  insert into audit_log(table_name, record_id, action, old_data, new_data, changed_fields, changed_by)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    case when tg_op = 'UPDATE' then changed end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_transactions
  after insert or update or delete on transactions
  for each row execute function audit_record();

