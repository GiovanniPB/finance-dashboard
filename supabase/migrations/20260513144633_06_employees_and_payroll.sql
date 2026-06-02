
create table employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  cost_center_id uuid references cost_centers(id) on delete set null,
  full_name text not null,
  cpf text,
  email text,
  role text,
  department text,
  employee_kind employee_kind not null default 'clt',
  base_salary numeric(18,2) not null check (base_salary >= 0),
  hire_date date not null,
  termination_date date,
  status employee_status not null default 'active',
  is_partner boolean not null default false,        -- sócios recebem dividendos
  metadata jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_emp_updated before update on employees
  for each row execute function set_updated_at();
create index idx_emp_company on employees(company_id) where deleted_at is null;
create unique index idx_emp_cpf on employees(company_id, cpf) where cpf is not null and deleted_at is null;

create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  reference_month date not null,
  status text not null default 'draft' check (status in ('draft','approved','posted')),
  posted_at timestamptz,
  total_fixed numeric(18,2) not null default 0,
  total_variable numeric(18,2) not null default 0,
  total_benefits numeric(18,2) not null default 0,
  total_charges numeric(18,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (company_id, reference_month)
);
create trigger trg_pr_updated before update on payroll_runs
  for each row execute function set_updated_at();

-- payroll_items: cada linha é um pagamento (fixo ou variável) para um colaborador num run
create table payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict,
  payment_type payroll_payment_type not null,

  gross_amount numeric(18,2) not null check (gross_amount >= 0),
  inss numeric(18,2) not null default 0,
  fgts numeric(18,2) not null default 0,
  irrf numeric(18,2) not null default 0,
  benefits numeric(18,2) not null default 0,
  other_deductions numeric(18,2) not null default 0,
  net_amount numeric(18,2) generated always as (
    gross_amount + benefits - inss - irrf - other_deductions
  ) stored,
  employer_cost numeric(18,2) generated always as (
    gross_amount + benefits + fgts
  ) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_pi_updated before update on payroll_items
  for each row execute function set_updated_at();
create index idx_pi_run on payroll_items(payroll_run_id);
create index idx_pi_emp on payroll_items(employee_id);
create index idx_pi_type on payroll_items(payment_type);

alter table transactions
  add constraint fk_tx_payroll foreign key (payroll_item_id)
  references payroll_items(id) on delete set null;

-- auditoria em employees e payroll_items
create trigger trg_audit_employees
  after insert or update or delete on employees
  for each row execute function audit_record();
create trigger trg_audit_payroll_items
  after insert or update or delete on payroll_items
  for each row execute function audit_record();

