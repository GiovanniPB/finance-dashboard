-- Permissions hardening (2/3): RLS por comando (SELECT vs escrita) + escopo por módulo.
--
-- Antes: toda tabela company-scoped tinha uma policy única `for all` gated só por
-- has_company_access → qualquer usuário com acesso à empresa escrevia (viewer inclusive),
-- e não havia escopo de visualização. Agora:
--   SELECT  = has_company_access(company)  AND can_view_module(<módulo>)
--   ESCRITA = has_company_write_access(company)   [papel admin/editor; viewer não escreve]
-- (escrita NÃO é gated por módulo de propósito: módulo controla visibilidade; escrever é
--  função do papel — evita travar RPCs que cruzam domínios, ex.: post_payroll → transactions.)

-- Helper local: derruba todas as policies existentes de uma tabela (nomes variam entre
-- as migrations antigas: umas usam "<t>_scoped" for-all, outras 4 policies nomeadas).
create or replace function public._drop_all_policies(p_table text)
returns void language plpgsql as $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = p_table
  loop
    execute format('drop policy %I on public.%I', r.policyname, p_table);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- A) Tabelas com company_id direto → gerar as 4 policies via loop (tabela, módulo).
-- ---------------------------------------------------------------------------
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('transactions',            'financials'),
      ('chart_of_accounts',       'financials'),
      ('cost_centers',            'financials'),
      ('bank_accounts',           'financials'),
      ('recurring_templates',     'financials'),
      ('import_batches',          'financials'),
      ('bank_statement_lines',    'financials'),
      ('attachments',             'financials'),
      ('employees',               'payroll'),
      ('payroll_runs',            'payroll'),
      ('payroll_account_mappings','payroll'),
      ('tax_obligations',         'taxes'),
      ('fiscal_company_settings', 'nfse'),
      ('pagarme_recipient_map',   'nfse'),
      ('service_catalog',         'nfse'),
      ('invoice_jobs',            'nfse')
    ) as t(tbl, module)
  loop
    perform public._drop_all_policies(rec.tbl);

    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (public.has_company_access(company_id) and public.can_view_module(%L::public.data_module))
    $f$, rec.tbl || '_sel', rec.tbl, rec.module);

    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (public.has_company_write_access(company_id))
    $f$, rec.tbl || '_ins', rec.tbl);

    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (public.has_company_write_access(company_id))
      with check (public.has_company_write_access(company_id))
    $f$, rec.tbl || '_upd', rec.tbl);

    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (public.has_company_write_access(company_id))
    $f$, rec.tbl || '_del', rec.tbl);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- B) Tabelas ligadas por parent (sem company_id próprio) → resolve pelo pai.
-- ---------------------------------------------------------------------------

-- cash_balance_snapshots → bank_accounts (financials)
select public._drop_all_policies('cash_balance_snapshots');
create policy "cash_balance_snapshots_sel" on public.cash_balance_snapshots for select to authenticated
  using (
    public.can_view_module('financials')
    and exists (select 1 from public.bank_accounts b
                where b.id = cash_balance_snapshots.bank_account_id
                  and public.has_company_access(b.company_id))
  );
create policy "cash_balance_snapshots_wr" on public.cash_balance_snapshots for all to authenticated
  using (
    exists (select 1 from public.bank_accounts b
            where b.id = cash_balance_snapshots.bank_account_id
              and public.has_company_write_access(b.company_id))
  )
  with check (
    exists (select 1 from public.bank_accounts b
            where b.id = cash_balance_snapshots.bank_account_id
              and public.has_company_write_access(b.company_id))
  );

-- import_rows → import_batches (financials)
select public._drop_all_policies('import_rows');
create policy "import_rows_sel" on public.import_rows for select to authenticated
  using (
    public.can_view_module('financials')
    and exists (select 1 from public.import_batches b
                where b.id = import_rows.import_batch_id
                  and public.has_company_access(b.company_id))
  );
create policy "import_rows_wr" on public.import_rows for all to authenticated
  using (
    exists (select 1 from public.import_batches b
            where b.id = import_rows.import_batch_id
              and public.has_company_write_access(b.company_id))
  )
  with check (
    exists (select 1 from public.import_batches b
            where b.id = import_rows.import_batch_id
              and public.has_company_write_access(b.company_id))
  );

-- payroll_items → payroll_runs (payroll)
select public._drop_all_policies('payroll_items');
create policy "payroll_items_sel" on public.payroll_items for select to authenticated
  using (
    public.can_view_module('payroll')
    and exists (select 1 from public.payroll_runs r
                where r.id = payroll_items.payroll_run_id
                  and public.has_company_access(r.company_id))
  );
create policy "payroll_items_wr" on public.payroll_items for all to authenticated
  using (
    exists (select 1 from public.payroll_runs r
            where r.id = payroll_items.payroll_run_id
              and public.has_company_write_access(r.company_id))
  )
  with check (
    exists (select 1 from public.payroll_runs r
            where r.id = payroll_items.payroll_run_id
              and public.has_company_write_access(r.company_id))
  );

-- ---------------------------------------------------------------------------
-- C) Tabelas especiais.
-- ---------------------------------------------------------------------------

-- pagarme_accounts → usa owner_company_id (nfse)
select public._drop_all_policies('pagarme_accounts');
create policy "pagarme_accounts_sel" on public.pagarme_accounts for select to authenticated
  using (public.has_company_access(owner_company_id) and public.can_view_module('nfse'));
create policy "pagarme_accounts_wr" on public.pagarme_accounts for all to authenticated
  using (public.has_company_write_access(owner_company_id))
  with check (public.has_company_write_access(owner_company_id));

-- counterparties → org-wide (sem company_id). Leitura: qualquer acesso + módulo financials.
-- Escrita: admin/editor com pelo menos uma empresa.
select public._drop_all_policies('counterparties');
create policy "counterparties_sel" on public.counterparties for select to authenticated
  using (
    public.can_view_module('financials')
    and (public.is_super_admin()
         or exists (select 1 from public.company_access where user_id = auth.uid()))
  );
create policy "counterparties_wr" on public.counterparties for all to authenticated
  using (
    public.is_super_admin()
    or (public.current_user_role() in ('admin', 'editor')
        and exists (select 1 from public.company_access where user_id = auth.uid()))
  )
  with check (
    public.is_super_admin()
    or (public.current_user_role() in ('admin', 'editor')
        and exists (select 1 from public.company_access where user_id = auth.uid()))
  );

-- companies → a lista em si. Leitura por acesso; escrita por papel (criar nova = super_admin,
-- pois has_company_write_access exige acesso a um id que ainda não existe). Sem gate de módulo.
select public._drop_all_policies('companies');
create policy "companies_sel" on public.companies for select to authenticated
  using (public.is_super_admin() or public.has_company_access(id));
create policy "companies_ins" on public.companies for insert to authenticated
  with check (public.is_super_admin());
create policy "companies_upd" on public.companies for update to authenticated
  using (public.has_company_write_access(id))
  with check (public.has_company_write_access(id));
create policy "companies_del" on public.companies for delete to authenticated
  using (public.is_super_admin());

-- audit_log → somente leitura, gate por módulo 'audit'. (Escopo por empresa é follow-up:
-- audit_log guarda mudanças arbitrárias e não tem company_id.)
select public._drop_all_policies('audit_log');
create policy "audit_log_sel" on public.audit_log for select to authenticated
  using (public.is_financial_user() and public.can_view_module('audit'));

-- profiles (M1) → viewer só lê o próprio perfil; admin/editor/super_admin leem todos
-- (necessário para a lista de usuários e para os nomes no audit_log_list). Mantém
-- update/insert self já existentes.
drop policy if exists profiles_read_all on public.profiles;
create policy profiles_read_scoped on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_super_admin()
    or public.current_user_role() in ('admin', 'editor')
  );

-- Nota: organizations e chart_of_accounts_master permanecem com a policy financial_all
-- (dados de referência não sensíveis por empresa). sales_events/focus_events permanecem
-- restritas a super_admin. RPCs de secret NFS-e continuam security definer com checagem própria.

drop function public._drop_all_policies(text);
