
-- extensions
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- enums
create type company_tax_regime as enum ('simples', 'lucro_presumido', 'lucro_real', 'mei');

create type account_kind as enum (
  'revenue',
  'revenue_deduction',         -- impostos sobre venda (IRRF, ISS, PIS, COFINS, IRPJ, CSLL, DAS)
  'cogs',                       -- custo de produto/serviço vendido (folha dos assessores aqui)
  'operating_expense',          -- despesas operacionais (utilidades, aluguel, etc)
  'personnel_expense',          -- despesas com pessoal administrativo
  'financial_expense',
  'financial_income',
  'dividend',                   -- distribuição de dividendos
  'partner_bonus',              -- bônus líquido aos sócios
  'partner_reimbursement',      -- reembolso de cartão de crédito a sócios
  'capital_movement',           -- outras movimentações de capital
  'asset',
  'liability',
  'equity',
  'tax_on_profit',              -- IRPJ/CSLL sobre lucro (caso futuro)
  'summary'                     -- linhas totalizadoras (=)
);

create type dre_section as enum (
  'gross_revenue',
  'revenue_deductions',
  'net_revenue',
  'cogs',
  'contribution_margin',
  'fixed_costs',
  'fixed_costs_personnel',
  'fixed_costs_utilities',
  'financial_result',
  'net_result',
  'profitability',
  'capital_movements',
  'cash_generation',
  'balance_snapshot',
  'applications',
  'operational_data'
);

create type transaction_direction as enum ('inflow', 'outflow');
create type transaction_status as enum ('scheduled', 'pending', 'settled', 'reconciled', 'canceled');
create type recurrence_frequency as enum ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly');
create type employee_status as enum ('active', 'on_leave', 'terminated');
create type employee_kind as enum ('clt', 'pj', 'intern', 'partner');
create type import_status as enum ('uploaded', 'mapped', 'previewed', 'committed', 'failed');
create type bank_account_type as enum ('checking', 'savings', 'cdb_automatic', 'cdb_daily', 'cdb_term', 'investment_fund', 'cash');
create type payroll_payment_type as enum ('fixed', 'variable', 'bonus', 'vacation', 'thirteenth', 'severance', 'adjustment');

-- helper: updated_at trigger
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- organizations
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_organizations_updated before update on organizations
  for each row execute function set_updated_at();

-- profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  legal_name text not null,
  trade_name text,
  cnpj text unique,
  tax_regime company_tax_regime not null default 'lucro_presumido',
  is_holding boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  brand_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create trigger trg_companies_updated before update on companies
  for each row execute function set_updated_at();
create index idx_companies_org on companies(organization_id);
create index idx_companies_active on companies(is_active) where is_active = true;

