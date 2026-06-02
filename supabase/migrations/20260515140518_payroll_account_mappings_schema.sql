-- payroll_component: granular components of a payroll_item that should land in
-- different DRE accounts. Each row in payroll_items can emit multiple
-- transactions based on which non-zero components it carries.
create type public.payroll_component as enum (
  'salary_fixed',         -- fixed_amount or gross_amount when payment_type='fixed'
  'salary_variable',      -- variable_amount, vacation, thirteenth, severance, adjustment
  'salary_bonus',         -- bonus_amount + profit_sharing_amount
  'fgts',                 -- fgts column (employer cost)
  'benefits',             -- benefits column (lumped for now)
  'irrf_withheld',        -- irrf column (employee withholding → liability)
  'inss_withheld'         -- inss column (employee withholding → liability)
);

-- payroll_account_mappings: (company, employee_kind, component) → chart account.
-- Used by post_payroll_run to fan out one payroll_item into multiple transactions.
create table public.payroll_account_mappings (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  employee_kind   public.employee_kind not null,
  component       public.payroll_component not null,
  account_id      uuid not null references public.chart_of_accounts(id) on delete restrict,
  cost_center_id  uuid references public.cost_centers(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, employee_kind, component)
);

create index payroll_account_mappings_company_idx
  on public.payroll_account_mappings(company_id);

alter table public.payroll_account_mappings enable row level security;

create policy "Read payroll mappings"
  on public.payroll_account_mappings for select to authenticated
  using (has_company_access(company_id));
create policy "Insert payroll mappings"
  on public.payroll_account_mappings for insert to authenticated
  with check (has_company_access(company_id));
create policy "Update payroll mappings"
  on public.payroll_account_mappings for update to authenticated
  using (has_company_access(company_id));
create policy "Delete payroll mappings"
  on public.payroll_account_mappings for delete to authenticated
  using (has_company_access(company_id));

comment on table public.payroll_account_mappings is
  'Matrix (employee_kind, component) → DRE account used to post payroll runs';
