-- Replace 'financial_all' policies on company-scoped tables with access-checked policies.
-- Super admins bypass all checks; other users only see/edit data of companies in their company_access list.

-- Companies: filter the company list itself
drop policy if exists "financial_all" on public.companies;
create policy "companies_scoped" on public.companies
  for all
  using (public.is_super_admin() or public.has_company_access(id))
  with check (public.is_super_admin() or public.has_company_access(id));

-- Bank accounts
drop policy if exists "financial_all" on public.bank_accounts;
create policy "bank_accounts_scoped" on public.bank_accounts
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

-- Cash balance snapshots (via bank_account → company)
drop policy if exists "financial_all" on public.cash_balance_snapshots;
create policy "cash_balance_snapshots_scoped" on public.cash_balance_snapshots
  for all
  using (
    public.is_super_admin()
    or exists (
      select 1 from bank_accounts b
      where b.id = cash_balance_snapshots.bank_account_id
        and public.has_company_access(b.company_id)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from bank_accounts b
      where b.id = cash_balance_snapshots.bank_account_id
        and public.has_company_access(b.company_id)
    )
  );

-- Chart of accounts
drop policy if exists "financial_all" on public.chart_of_accounts;
create policy "chart_of_accounts_scoped" on public.chart_of_accounts
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

-- Cost centers
drop policy if exists "financial_all" on public.cost_centers;
create policy "cost_centers_scoped" on public.cost_centers
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

-- Employees
drop policy if exists "financial_all" on public.employees;
create policy "employees_scoped" on public.employees
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

-- Import batches
drop policy if exists "financial_all" on public.import_batches;
create policy "import_batches_scoped" on public.import_batches
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

-- Import rows (via batch → company)
drop policy if exists "financial_all" on public.import_rows;
create policy "import_rows_scoped" on public.import_rows
  for all
  using (
    public.is_super_admin()
    or exists (
      select 1 from import_batches b
      where b.id = import_rows.import_batch_id
        and public.has_company_access(b.company_id)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from import_batches b
      where b.id = import_rows.import_batch_id
        and public.has_company_access(b.company_id)
    )
  );

-- Payroll runs
drop policy if exists "financial_all" on public.payroll_runs;
create policy "payroll_runs_scoped" on public.payroll_runs
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

-- Payroll items (via run → company)
drop policy if exists "financial_all" on public.payroll_items;
create policy "payroll_items_scoped" on public.payroll_items
  for all
  using (
    public.is_super_admin()
    or exists (
      select 1 from payroll_runs r
      where r.id = payroll_items.payroll_run_id
        and public.has_company_access(r.company_id)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from payroll_runs r
      where r.id = payroll_items.payroll_run_id
        and public.has_company_access(r.company_id)
    )
  );

-- Recurring templates
drop policy if exists "financial_all" on public.recurring_templates;
create policy "recurring_templates_scoped" on public.recurring_templates
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

-- Transactions
drop policy if exists "financial_all" on public.transactions;
create policy "transactions_scoped" on public.transactions
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

-- Counterparties: organization-scoped, no company_id — keep authenticated-only (auth user with at least one company access).
drop policy if exists "financial_all" on public.counterparties;
create policy "counterparties_any_access" on public.counterparties
  for all
  using (
    public.is_super_admin()
    or exists (select 1 from company_access where user_id = auth.uid())
  )
  with check (
    public.is_super_admin()
    or exists (select 1 from company_access where user_id = auth.uid())
  );

