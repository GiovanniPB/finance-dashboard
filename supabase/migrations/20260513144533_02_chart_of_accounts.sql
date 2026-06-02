
-- master chart (organização-wide, base para consolidação)
create table chart_of_accounts_master (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  kind account_kind not null,
  dre_section dre_section,
  parent_id uuid references chart_of_accounts_master(id) on delete restrict,
  is_summary boolean not null default false,
  below_the_line boolean not null default false,
  sign_hint text check (sign_hint in ('+','-','+/-')),  -- visual hint para UI ((+) Venda, (-) IRRF)
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create trigger trg_coa_master_updated before update on chart_of_accounts_master
  for each row execute function set_updated_at();
create index idx_coa_master_org on chart_of_accounts_master(organization_id);
create index idx_coa_master_parent on chart_of_accounts_master(parent_id);
create index idx_coa_master_section on chart_of_accounts_master(dre_section);

-- per-company chart
create table chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  kind account_kind not null,
  dre_section dre_section,
  parent_id uuid references chart_of_accounts(id) on delete restrict,
  master_account_id uuid references chart_of_accounts_master(id) on delete set null,
  is_summary boolean not null default false,
  below_the_line boolean not null default false,
  sign_hint text check (sign_hint in ('+','-','+/-')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
create trigger trg_coa_updated before update on chart_of_accounts
  for each row execute function set_updated_at();
create index idx_coa_company on chart_of_accounts(company_id);
create index idx_coa_master on chart_of_accounts(master_account_id);
create index idx_coa_parent on chart_of_accounts(parent_id);
create index idx_coa_section on chart_of_accounts(dre_section);

-- cost centers (Comercial/Assessores vs Administrativo, Departamento, Projeto)
create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
create trigger trg_cc_updated before update on cost_centers
  for each row execute function set_updated_at();
create index idx_cc_company on cost_centers(company_id);

