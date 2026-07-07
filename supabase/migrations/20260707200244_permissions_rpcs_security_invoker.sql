-- Permissions hardening (3/3): RPCs de dados passam a SECURITY INVOKER.
--
-- Antes: ~20 funções `security definer` concedidas a `authenticated` NÃO checavam acesso →
-- qualquer usuário logado lia/mutava qualquer empresa passando o UUID certo (bypass total do
-- RLS, incluindo escritas: register_payment, post_payroll_run, delete_*, mark_tax_paid...).
--
-- Correção: torná-las `security invoker`. Assim elas rodam com os privilégios do chamador e o
-- RLS reescrito em (2/3) vira a fonte única de verdade — leitura por has_company_access+módulo,
-- escrita por has_company_write_access. Alinha com as RPCs que já eram invoker (dre_by_company).
--
-- Mantêm-se DEFINER de propósito (NÃO alteradas):
--   - helpers de RLS: is_super_admin, has_company_access, current_user_role, is_financial_user,
--     can_view_module, has_company_write_access, _find_company_account;
--   - triggers: handle_new_user, audit_record, sync_payroll_item_transaction, set_updated_at;
--   - RPCs de secret NFS-e (rotate_account_webhook_secret, set_company_focus_token,
--     get_focus_token, claim_nfse_jobs, get_pagarme_webhook_secret) — já checam acesso e/ou
--     são service_role, e precisam de definer para tocar Vault/segredos.
--
-- Observação sobre batch/cron: generate_recurring_transactions é chamada pelo pg_cron como
-- superusuário (postgres), que ignora RLS → segue processando todas as empresas. Chamada por
-- um usuário comum, passa a respeitar o RLS (só escreve nas empresas onde tem permissão).

-- Relatórios / agregados (leitura)
alter function public.cost_center_analysis(uuid, date, date) security invoker;
alter function public.counterparty_analysis(uuid, date, date, text, int) security invoker;
alter function public.dre_comparison(uuid, date, date, date, date) security invoker;
alter function public.company_stats() security invoker;
alter function public.forecast_cashflow_daily(uuid, date, date) security invoker;

-- Impostos
alter function public.compute_company_rbt12(uuid, date) security invoker;
alter function public.compute_company_period_revenue(uuid, date) security invoker;
alter function public.generate_tax_obligations(uuid, date) security invoker;
alter function public.mark_tax_paid(uuid, date, uuid, uuid, numeric) security invoker;
alter function public.mark_overdue_obligations(uuid) security invoker;

-- Conciliação
alter function public.suggest_match_candidates(uuid, int) security invoker;
alter function public.match_statement_line(uuid, uuid) security invoker;
alter function public.unmatch_statement_line(uuid) security invoker;
alter function public.ignore_statement_line(uuid) security invoker;
alter function public.create_transaction_from_line(uuid, uuid, uuid, uuid) security invoker;

-- Contas a pagar/receber
alter function public.create_installments(jsonb, int, int, date) security invoker;
alter function public.register_payment(uuid, numeric, date, uuid, numeric, numeric, numeric) security invoker;

-- Folha
alter function public.setup_payroll_mappings_defaults(uuid) security invoker;
alter function public.post_payroll_run(uuid, uuid) security invoker;
alter function public.preview_payroll_posting(uuid) security invoker;
alter function public.create_payroll_run_with_active_employees(uuid, date) security invoker;
alter function public.delete_payroll_run(uuid) security invoker;
alter function public.delete_employee(uuid) security invoker;

-- Plano de contas
alter function public.delete_chart_account(uuid) security invoker;

-- Recorrências
alter function public.approve_recurring_template(uuid) security invoker;
alter function public.backfill_recurring_template(uuid, date) security invoker;
alter function public.generate_recurring_transactions(date) security invoker;
