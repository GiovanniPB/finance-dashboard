-- =============================================================================
-- RLS: tirar as funções auxiliares do caminho POR LINHA (InitPlan + semi-join)
--
-- PROBLEMA
-- --------
-- Todas as policies de leitura chamavam `has_company_access(company_id)`, que é
-- `security definer`. Postgres NÃO faz inlining de função `security definer`, e
-- como o argumento depende da linha, a chamada não vira InitPlan: ela é executada
-- DE VERDADE uma vez por linha varrida — e cada execução ainda roda
-- `is_super_admin()` (outra query em `profiles`) mais um `exists` em
-- `company_access`.
--
-- Medido em produção (47.130 recebíveis, usuário `editor` com 4 empresas):
--
--   mesma agregação, sem RLS ................    43 ms /   2.163 buffers
--   mesma agregação, com RLS ................ 12.460 ms / 344.105 buffers
--   `v_pagarme_ledger_health` ............... 48.424 ms /   1,3M buffers
--
-- Com `statement_timeout = 8s` no papel `authenticated`, o /vendas não era só
-- lento: ele estourava. O volume de dados NÃO é o problema — 47k linhas é trivial
-- para o Postgres. O problema é o predicado.
--
-- SOLUÇÃO
-- -------
-- Reescrever o predicado em forma de CONJUNTO, preservando exatamente a
-- semântica:
--
--   has_company_access(x)  ≡  is_super_admin() or exists(company_access …)
--
--   antes:  has_company_access(company_id) and can_view_module('sales')
--   depois: (select can_view_module('sales'))
--           and ( (select is_super_admin())
--                 or company_id in (select ca.company_id from company_access ca
--                                   where ca.user_id = (select auth.uid())) )
--
-- O que muda no plano:
--  · `(select …)` sem dependência de linha vira InitPlan — avaliado UMA vez;
--  · `company_id in (subquery não-correlacionada)` vira `hashed SubPlan` —
--    o conjunto de empresas é lido uma vez e vira hash semi-join, O(1) por linha.
--
-- Resultado do mesmo count: 5.743 ms -> 22 ms (equivalência de linhas conferida
-- por usuário: 0 diferenças, nos dois sentidos).
--
-- NOTA sobre a forma escolhida: uma função auxiliar `setof uuid` (`my_company_ids()`)
-- também é equivalente e mais DRY, mas medimos ~820–1.730 ms contra ~22 ms da
-- subquery inline (o `ProjectSet` de SRF não recebe o mesmo tratamento de hash).
-- Por isso a subquery vai inline, apesar de mais verbosa.
--
-- ESCOPO: só o caminho de LEITURA — as 33 policies de SELECT e as policies
-- `for all` (que também governam SELECT). As policies puras de INSERT/UPDATE/
-- DELETE continuam como estavam: elas incidem sobre a linha sendo escrita
-- (tipicamente uma, por PK), então não são o gargalo e mexer nelas só ampliaria
-- o risco desta migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Família A — tabelas com a empresa em coluna própria
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  minhas constant text :=
    '(select ca.company_id from public.company_access ca where ca.user_id = (select auth.uid()))';
begin
  for r in
    select * from (values
      ('attachments',              'financials', 'company_id'),
      ('bank_accounts',            'financials', 'company_id'),
      ('bank_statement_lines',     'financials', 'company_id'),
      ('chart_of_accounts',        'financials', 'company_id'),
      ('cost_centers',             'financials', 'company_id'),
      ('import_batches',           'financials', 'company_id'),
      ('recurring_templates',      'financials', 'company_id'),
      ('transactions',             'financials', 'company_id'),
      ('employees',                'payroll',    'company_id'),
      ('payroll_account_mappings', 'payroll',    'company_id'),
      ('payroll_runs',             'payroll',    'company_id'),
      ('tax_obligations',          'taxes',      'company_id'),
      ('fiscal_company_settings',  'nfse',       'company_id'),
      ('invoice_jobs',             'nfse',       'company_id'),
      ('pagarme_recipient_map',    'nfse',       'company_id'),
      ('service_catalog',          'nfse',       'company_id'),
      -- a conexão pagar.me é escopada pela empresa DONA
      ('pagarme_accounts',         'nfse',       'owner_company_id'),
      ('pagarme_ledger_settings',  'sales',      'company_id'),
      ('pagarme_payouts',          'sales',      'company_id'),
      ('pagarme_receivables',      'sales',      'company_id')
    ) as t(tabela, modulo, coluna)
  loop
    execute format('drop policy if exists %I on public.%I', r.tabela || '_sel', r.tabela);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        (select public.can_view_module(%L))
        and ( (select public.is_super_admin()) or %I in %s )
      )
    $f$, r.tabela || '_sel', r.tabela, r.modulo, r.coluna, minhas);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Família B — tabelas escopadas pela empresa dona da CONEXÃO pagar.me
--
-- A referência a `pagarme_accounts` continua sujeita à RLS daquela tabela, igual
-- ao predicado antigo (que lia a mesma tabela numa subquery escalar). Isto
-- preserva o acoplamento existente com o módulo `nfse` — mudá-lo seria mudar
-- semântica, e não é o objetivo desta migration.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  minhas constant text :=
    '(select ca.company_id from public.company_access ca where ca.user_id = (select auth.uid()))';
begin
  for r in
    select * from (values
      ('pagarme_charges',       'sales'),
      ('pagarme_customers',     'sales'),
      ('pagarme_subscriptions', 'sales'),
      ('pagarme_sync_runs',     'sales'),
      ('invoice_backfill_runs', 'nfse')
    ) as t(tabela, modulo)
  loop
    execute format('drop policy if exists %I on public.%I', r.tabela || '_sel', r.tabela);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        (select public.can_view_module(%L))
        and (
          (select public.is_super_admin())
          or pagarme_account_id in (
               select a.id from public.pagarme_accounts a where a.owner_company_id in %s
             )
        )
      )
    $f$, r.tabela || '_sel', r.tabela, r.modulo, minhas);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Família C — tabelas filhas, escopadas pela empresa da tabela PAI
--
-- Aqui o `is_super_admin()` fica DENTRO da subquery de propósito: o predicado
-- antigo era `exists(pai where pai.id = fk and has_company_access(…))`, ou seja,
-- exigia que a linha pai EXISTISSE mesmo para super admin. Tirar o super admin
-- para fora da subquery afrouxaria isso para FK nula/órfã.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  minhas constant text :=
    '(select ca.company_id from public.company_access ca where ca.user_id = (select auth.uid()))';
begin
  for r in
    select * from (values
      ('cash_balance_snapshots', 'financials', 'bank_account_id',  'bank_accounts'),
      ('import_rows',            'financials', 'import_batch_id',  'import_batches'),
      ('payroll_items',          'payroll',    'payroll_run_id',   'payroll_runs')
    ) as t(tabela, modulo, fk, pai)
  loop
    execute format('drop policy if exists %I on public.%I', r.tabela || '_sel', r.tabela);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        (select public.can_view_module(%L))
        and %I in (
              select p.id from public.%I p
              where (select public.is_super_admin()) or p.company_id in %s
            )
      )
    $f$, r.tabela || '_sel', r.tabela, r.modulo, r.fk, r.pai, minhas);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Família D — predicados próprios (um a um, porque cada um tem sua forma)
-- -----------------------------------------------------------------------------

-- `audit_log` e `counterparties` não dependem da linha: o predicado inteiro vira
-- One-Time Filter.
drop policy if exists audit_log_sel on public.audit_log;
create policy audit_log_sel on public.audit_log for select to authenticated
using (
  (select public.is_financial_user()) and (select public.can_view_module('audit'))
);

drop policy if exists counterparties_sel on public.counterparties;
create policy counterparties_sel on public.counterparties for select to authenticated
using (
  (select public.can_view_module('financials'))
  and (
    (select public.is_super_admin())
    or (select exists (
          select 1 from public.company_access where user_id = (select auth.uid())
       ))
  )
);

drop policy if exists companies_sel on public.companies;
create policy companies_sel on public.companies for select to authenticated
using (
  (select public.is_super_admin())
  or id in (select ca.company_id from public.company_access ca where ca.user_id = (select auth.uid()))
);

drop policy if exists profiles_read_scoped on public.profiles;
create policy profiles_read_scoped on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select public.is_super_admin())
  or (select public.current_user_role()) = any (array['admin'::public.user_role, 'editor'::public.user_role])
);

-- organização: o acesso é derivado das empresas do usuário
drop policy if exists report_templates_sel on public.report_templates;
create policy report_templates_sel on public.report_templates for select to authenticated
using (
  (select public.can_view_module('financials'))
  and (
    (select public.is_super_admin())
    or organization_id in (
         select c.organization_id
         from public.company_access ca
         join public.companies c on c.id = ca.company_id
         where ca.user_id = (select auth.uid())
       )
  )
);

-- -----------------------------------------------------------------------------
-- Policies `for all` — governam SELECT também (permissivas, OR com a de SELECT)
--
-- `pagarme_accounts_wr` era especialmente cara: aparecia 47.130 vezes no plano de
-- `v_pagarme_ledger_health`, uma por recebível varrido.
--
--   has_company_write_access(x) ≡ is_super_admin()
--                                 or (has_company_access(x) and papel in (admin, editor))
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  minhas constant text :=
    '(select ca.company_id from public.company_access ca where ca.user_id = (select auth.uid()))';
  escrita constant text :=
    '(select public.current_user_role()) in (''admin''::public.user_role, ''editor''::public.user_role)';
begin
  for r in
    select * from (values
      ('pagarme_accounts', 'pagarme_accounts_wr', 'owner_company_id')
    ) as t(tabela, policy, coluna)
  loop
    execute format('drop policy if exists %I on public.%I', r.policy, r.tabela);
    execute format($f$
      create policy %I on public.%I for all to authenticated
      using       ((select public.is_super_admin()) or (%s and %I in %s))
      with check  ((select public.is_super_admin()) or (%s and %I in %s))
    $f$, r.policy, r.tabela,
         escrita, r.coluna, minhas,
         escrita, r.coluna, minhas);
  end loop;
end $$;

-- filhas: mesma regra da família C, mas com o helper de ESCRITA
do $$
declare
  r record;
  minhas constant text :=
    '(select ca.company_id from public.company_access ca where ca.user_id = (select auth.uid()))';
  pred text;
begin
  for r in
    select * from (values
      ('cash_balance_snapshots', 'cash_balance_snapshots_wr', 'bank_account_id', 'bank_accounts'),
      ('import_rows',            'import_rows_wr',            'import_batch_id', 'import_batches'),
      ('payroll_items',          'payroll_items_wr',          'payroll_run_id',  'payroll_runs')
    ) as t(tabela, policy, fk, pai)
  loop
    pred := format(
      '%I in (select p.id from public.%I p where (select public.is_super_admin()) or ('
      || '(select public.current_user_role()) in (''admin''::public.user_role, ''editor''::public.user_role)'
      || ' and p.company_id in %s))',
      r.fk, r.pai, minhas);
    execute format('drop policy if exists %I on public.%I', r.policy, r.tabela);
    execute format(
      'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
      r.policy, r.tabela, pred, pred);
  end loop;
end $$;

drop policy if exists invoice_backfill_runs_wr on public.invoice_backfill_runs;
create policy invoice_backfill_runs_wr on public.invoice_backfill_runs for all to authenticated
using (
  (select public.is_super_admin())
  or (
    (select public.current_user_role()) in ('admin'::public.user_role, 'editor'::public.user_role)
    and pagarme_account_id in (
      select a.id from public.pagarme_accounts a
      where a.owner_company_id in (
        select ca.company_id from public.company_access ca where ca.user_id = (select auth.uid())
      )
    )
  )
)
with check (
  (select public.is_super_admin())
  or (
    (select public.current_user_role()) in ('admin'::public.user_role, 'editor'::public.user_role)
    and pagarme_account_id in (
      select a.id from public.pagarme_accounts a
      where a.owner_company_id in (
        select ca.company_id from public.company_access ca where ca.user_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists counterparties_wr on public.counterparties;
create policy counterparties_wr on public.counterparties for all to authenticated
using (
  (select public.is_super_admin())
  or (
    (select public.current_user_role()) = any (array['admin'::public.user_role, 'editor'::public.user_role])
    and (select exists (select 1 from public.company_access where user_id = (select auth.uid())))
  )
)
with check (
  (select public.is_super_admin())
  or (
    (select public.current_user_role()) = any (array['admin'::public.user_role, 'editor'::public.user_role])
    and (select exists (select 1 from public.company_access where user_id = (select auth.uid())))
  )
);

-- policies globais de um predicado só: basta virar InitPlan
drop policy if exists financial_all on public.chart_of_accounts_master;
create policy financial_all on public.chart_of_accounts_master for all to authenticated
using ((select public.is_financial_user())) with check ((select public.is_financial_user()));

drop policy if exists financial_all on public.organizations;
create policy financial_all on public.organizations for all to authenticated
using ((select public.is_financial_user())) with check ((select public.is_financial_user()));

drop policy if exists company_access_super_admin_all on public.company_access;
create policy company_access_super_admin_all on public.company_access for all
using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists focus_events_super_admin on public.focus_events;
create policy focus_events_super_admin on public.focus_events for all
using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists sales_events_super_admin on public.sales_events;
create policy sales_events_super_admin on public.sales_events for all
using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
