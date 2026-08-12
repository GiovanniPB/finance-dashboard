-- Cenários do horizonte de recorrências (migration 20260812132325).
--
-- Cobre a interação entre os gatilhos de propagação, marcação de edição manual,
-- resync de calendário e limpeza — que o Vitest não alcança, porque a lógica
-- toda vive no banco.
--
--   bun run db:reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/recurring_horizonte.sql
--
-- Roda inteiro dentro de uma transação e termina em rollback: não suja o banco.
-- Falha de cenário aborta com `FALHOU <cenário>`; sucesso lista os 29 checks.
\set ON_ERROR_STOP on
\timing off

begin;

create temp table resultado (n serial, cenario text, obtido text);

create or replace function pg_temp.check(p_label text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  if p_got is not distinct from p_want then
    insert into resultado (cenario, obtido) values (p_label, p_got::text);
  else
    raise exception 'FALHOU % → obtido %, esperado %', p_label, p_got, p_want;
  end if;
end $$;

do $$
declare
  v_company uuid := '00000000-0000-0000-0000-000000000013';
  v_account uuid;
  v_account2 uuid;
  v_tpl uuid;
  v_tx uuid;
  v_n int;
  v_date date;
  v_blocked boolean := false;
begin
  select id into v_account from chart_of_accounts
   where company_id = v_company and code = '6.2.06' limit 1;
  select id into v_account2 from chart_of_accounts
   where company_id = v_company and code = '6.2.05' limit 1;

  -- ─── 1. Horizonte gera 12 meses à frente ────────────────────────────
  insert into recurring_templates
    (company_id, account_id, description, amount, direction, frequency,
     day_of_month, start_date, next_run_date, auto_generate, is_active)
  values
    -- Início no dia 10 deste mês (já passou), para que toda ocorrência caia no
    -- dia do template e o cenário 5 possa afirmar sobre o dia da competência.
    (v_company, v_account, 'Aluguel', 1000.00, 'outflow', 'monthly',
     10, date_trunc('month', current_date)::date + 9,
     date_trunc('month', current_date)::date + 9, true, true)
  returning id into v_tpl;

  perform public.backfill_recurring_template(v_tpl);

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null;
  perform pg_temp.check('gera ocorrências até o horizonte (>= 12)', v_n >= 12, true);

  select max(accrual_date) into v_date from transactions
   where recurring_template_id = v_tpl and deleted_at is null;
  perform pg_temp.check('última ocorrência dentro do horizonte',
    v_date <= public.recurring_horizon_date(), true);

  perform pg_temp.check('fronteira parou depois do horizonte',
    (select next_run_date > public.recurring_horizon_date()
       from recurring_templates where id = v_tpl), true);

  -- Vencimento preenchido: é por ele que Contas a Pagar filtra.
  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and due_date is null and deleted_at is null;
  perform pg_temp.check('toda ocorrência tem vencimento', v_n, 0);

  -- ─── 2. Propagação de valor atinge só o futuro ──────────────────────
  update recurring_templates set amount = 1500.00 where id = v_tpl;

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and coalesce(due_date, accrual_date) > current_date and amount <> 1500.00;
  perform pg_temp.check('futuro recebeu o valor novo', v_n, 0);

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and coalesce(due_date, accrual_date) <= current_date and amount <> 1000.00;
  perform pg_temp.check('passado ficou com o valor antigo', v_n, 0);

  -- Propagação não pode marcar as próprias linhas como editadas à mão.
  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and recurring_manually_edited;
  perform pg_temp.check('propagação não marca edição manual', v_n, 0);

  -- ─── 3. Linha editada à mão fica blindada ───────────────────────────
  select id into v_tx from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and coalesce(due_date, accrual_date) > current_date
   order by accrual_date limit 1;

  update transactions set amount = 999.00 where id = v_tx;
  perform pg_temp.check('edição manual marcou a linha',
    (select recurring_manually_edited from transactions where id = v_tx), true);

  update recurring_templates set amount = 2000.00 where id = v_tpl;
  perform pg_temp.check('template não sobrescreveu a linha editada',
    (select amount from transactions where id = v_tx), 999.00::numeric);

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null and id <> v_tx
     and coalesce(due_date, accrual_date) > current_date and amount <> 2000.00;
  perform pg_temp.check('as demais futuras seguiram o template', v_n, 0);

  -- ─── 4. Conta e descrição também propagam ───────────────────────────
  update recurring_templates
     set account_id = v_account2, description = 'Aluguel reajustado'
   where id = v_tpl;

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null and id <> v_tx
     and coalesce(due_date, accrual_date) > current_date
     and (account_id <> v_account2 or description <> 'Aluguel reajustado');
  perform pg_temp.check('conta e descrição propagaram', v_n, 0);

  -- ─── 5. Mudança de calendário regenera o futuro ─────────────────────
  update recurring_templates set day_of_month = 25 where id = v_tpl;

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null and id <> v_tx
     and coalesce(due_date, accrual_date) > current_date
     and extract(day from accrual_date)::int <> 25;
  perform pg_temp.check('futuro regenerado no dia novo', v_n, 0);

  perform pg_temp.check('linha editada sobreviveu ao resync',
    (select count(*)::int from transactions where id = v_tx and deleted_at is null), 1);

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and coalesce(due_date, accrual_date) <= current_date
     and extract(day from accrual_date)::int <> 10;
  perform pg_temp.check('passado não foi remexido', v_n, 0);

  -- ─── 6. end_date encurtado corta o excedente ────────────────────────
  update recurring_templates
     set end_date = (current_date + interval '2 months')::date where id = v_tpl;

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null and id <> v_tx
     and accrual_date > (current_date + interval '2 months')::date;
  perform pg_temp.check('nada além do novo fim', v_n, 0);

  -- ─── 7. Desativar limpa o futuro intocado ───────────────────────────
  update recurring_templates set is_active = false where id = v_tpl;

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null and id <> v_tx
     and coalesce(due_date, accrual_date) > current_date;
  perform pg_temp.check('desativar apagou o futuro intocado', v_n, 0);

  perform pg_temp.check('mas manteve a linha editada',
    (select count(*)::int from transactions where id = v_tx and deleted_at is null), 1);

  -- ─── 8. Template manual não materializa o futuro ────────────────────
  insert into recurring_templates
    (company_id, account_id, description, amount, direction, frequency,
     day_of_month, start_date, next_run_date, auto_generate, is_active)
  values
    (v_company, v_account, 'Bônus manual', 500.00, 'outflow', 'monthly',
     5, current_date, current_date, false, true)
  returning id into v_tpl;

  perform public.backfill_recurring_template(v_tpl);

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and coalesce(due_date, accrual_date) > current_date;
  perform pg_temp.check('template manual não gera futuro', v_n, 0);

  perform public.generate_recurring_transactions();
  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and coalesce(due_date, accrual_date) > current_date;
  perform pg_temp.check('cron também ignora o manual', v_n, 0);

  -- ─── 9. Excluir o template leva o futuro intocado ───────────────────
  insert into recurring_templates
    (company_id, account_id, description, amount, direction, frequency,
     day_of_month, start_date, next_run_date, auto_generate, is_active)
  values
    (v_company, v_account, 'Assinatura', 90.00, 'outflow', 'monthly',
     15, current_date, current_date, true, true)
  returning id into v_tpl;

  perform public.backfill_recurring_template(v_tpl);
  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null;
  perform pg_temp.check('assinatura materializada', v_n >= 12, true);

  -- Uma ocorrência futura paga não pode sumir.
  select id into v_tx from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and coalesce(due_date, accrual_date) > current_date
   order by accrual_date limit 1;
  update transactions set paid_amount = 90.00, status = 'settled' where id = v_tx;

  delete from recurring_templates where id = v_tpl;

  select count(*)::int into v_n from transactions
   where recurring_template_id is null and id = v_tx and deleted_at is null;
  perform pg_temp.check('ocorrência paga sobreviveu à exclusão', v_n, 1);

  -- ─── 10. Guarda de acesso do backfill ───────────────────────────────
  -- `security definer` passa por cima da RLS; um usuário sem acesso à empresa
  -- não pode materializar as recorrências dela.
  insert into recurring_templates
    (company_id, account_id, description, amount, direction, frequency,
     day_of_month, start_date, next_run_date, auto_generate, is_active)
  values
    (v_company, v_account, 'Alheio', 10.00, 'outflow', 'monthly',
     5, current_date, current_date, true, true)
  returning id into v_tpl;

  perform set_config(
    'request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999"}', true);
  begin
    perform public.backfill_recurring_template(v_tpl);
  exception when others then
    v_blocked := true;
  end;
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.check('backfill barra empresa sem acesso', v_blocked, true);

  -- E o caminho do cron (sem JWT) continua livre.
  perform pg_temp.check('sem JWT o backfill roda',
    public.backfill_recurring_template(v_tpl) >= 12, true);

  -- ─── 11. Regressão: vencimento remarcado não vira duplicata ─────────
  -- Bug de 20260812132325: ocorrência com competência 20/07 e vencimento
  -- empurrado à mão para 20/09 sobrevivia ao resync, mas a âncora enxergava só
  -- a competência e gerava outra em 20/09 por cima.
  insert into recurring_templates
    (company_id, account_id, description, amount, direction, frequency,
     day_of_month, start_date, next_run_date, end_date, auto_generate, is_active)
  values
    (v_company, v_account, 'Vencimento remarcado', 2500.00, 'outflow', 'monthly',
     20, date '2026-01-20', date '2026-09-20', date '2026-08-31', true, true)
  returning id into v_tpl;

  insert into transactions
    (company_id, account_id, amount, direction, status, accrual_date, due_date,
     description, recurring_template_id, recurring_manually_edited)
  values
    (v_company, v_account, 2500.00, 'outflow', 'scheduled',
     date '2026-07-20', date '2026-09-20', 'Vencimento remarcado', v_tpl, true);

  update recurring_templates set end_date = null where id = v_tpl;

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and due_date = date '2026-09-20';
  perform pg_temp.check('vaga de 20/09 continua com um título só', v_n, 1);

  perform pg_temp.check('a linha preservada é a editada à mão',
    (select recurring_manually_edited from transactions
      where recurring_template_id = v_tpl and due_date = date '2026-09-20'
        and deleted_at is null), true);

  -- E o mês seguinte segue sendo gerado normalmente.
  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and due_date = date '2026-10-20';
  perform pg_temp.check('20/10 foi gerado', v_n, 1);

  -- ─── 12. A guarda vale para qualquer chamador ───────────────────────
  -- Fronteira forçada de volta para uma data já ocupada: a materialização
  -- direta tem de pular sem duplicar — e sem travar o template.
  update recurring_templates set next_run_date = date '2026-10-20' where id = v_tpl;

  v_tx := public.materialize_recurring_occurrence(v_tpl);
  perform pg_temp.check('materialização em data ocupada não gera nada', v_tx, null::uuid);

  select count(*)::int into v_n from transactions
   where recurring_template_id = v_tpl and deleted_at is null
     and due_date = date '2026-10-20';
  perform pg_temp.check('20/10 continua com um título só', v_n, 1);

  perform pg_temp.check('fronteira avançou mesmo tendo pulado',
    (select next_run_date from recurring_templates where id = v_tpl), date '2026-11-20');
end $$;

select n, cenario, obtido from resultado order by n;

rollback;
