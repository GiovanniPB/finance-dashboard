-- Corrige a duplicação de ocorrências introduzida em 20260812132325.
--
-- O QUE DEU ERRADO
--   O `resync_recurring_future` reposicionava a fronteira do template na maior
--   `accrual_date` já existente, com a justificativa de que competência é a
--   data que o calendário produziu e vencimento é negociável. O raciocínio
--   estava errado: quem ocupa uma vaga em Contas a Pagar é o **vencimento**.
--
--   Em produção havia ocorrências antigas com o vencimento empurrado à mão para
--   frente — competência 20/07, vencimento 20/09. Marcadas como editadas, elas
--   sobreviviam ao resync; mas a âncora enxergava só a competência de 20/07,
--   avançava mês a mês e gerava uma ocorrência nova em 20/09, em cima da que já
--   estava lá. Resultado: 13 títulos duplicados quando o `end_date` foi limpo.
--
-- A CORREÇÃO, EM DUAS CAMADAS
--   1. A âncora passa a olhar a data mais distante que o template já ocupa,
--      seja competência ou vencimento.
--   2. `materialize_recurring_occurrence` recusa criar ocorrência numa data que
--      o template já ocupa, venha de onde vier a chamada — cron, backfill ou
--      aprovação manual. A camada 1 sozinha resolveria este caso; a 2 existe
--      porque duplicar título a pagar é erro que vira pagamento em dobro, e
--      esse tipo de invariante tem que morar no ponto único de criação.

-- ===========================================================
-- 1. Ponto único de criação, agora com guarda de colisão
-- ===========================================================

create or replace function public.materialize_recurring_occurrence(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t recurring_templates;
  v_tx_id uuid;
  v_ocupado boolean;
begin
  select * into t from recurring_templates where id = p_template_id;
  if t.id is null then
    raise exception 'Template % não encontrado', p_template_id;
  end if;
  if not t.is_active then
    raise exception 'Template % está inativo', p_template_id;
  end if;
  if t.end_date is not null and t.next_run_date > t.end_date then
    raise exception 'Template % já encerrou em %', p_template_id, t.end_date;
  end if;
  if t.max_occurrences is not null and t.total_generated >= t.max_occurrences then
    raise exception 'Template % atingiu o limite de % ocorrências', p_template_id, t.max_occurrences;
  end if;

  -- A data está ocupada se já existe ocorrência viva deste template ali, seja
  -- pela competência ou pelo vencimento. As duas contam: uma ocorrência que
  -- teve o vencimento remarcado continua sendo a ocorrência daquela data.
  select exists (
    select 1 from transactions tx
     where tx.recurring_template_id = t.id
       and tx.deleted_at is null
       and (tx.accrual_date = t.next_run_date
            or coalesce(tx.due_date, tx.accrual_date) = t.next_run_date)
  ) into v_ocupado;

  if v_ocupado then
    -- Avança a fronteira sem gerar: pular é o comportamento certo, e travar
    -- faria o cron parar de andar para o template inteiro.
    update recurring_templates
       set next_run_date = advance_recurrence_date(next_run_date, frequency::text, day_of_month),
           updated_at = now()
     where id = t.id;
    return null;
  end if;

  insert into transactions (
    company_id, account_id, cost_center_id, bank_account_id, counterparty_id,
    amount, direction, status, accrual_date, due_date, description,
    notes, document_ref, recurring_template_id, created_by
  ) values (
    t.company_id, t.account_id, t.cost_center_id, t.bank_account_id, t.counterparty_id,
    t.amount, t.direction, 'scheduled', t.next_run_date, t.next_run_date,
    t.description, t.notes, t.document_ref, t.id, auth.uid()
  ) returning id into v_tx_id;

  update recurring_templates
  set
    last_generated_date = next_run_date,
    next_run_date = advance_recurrence_date(next_run_date, frequency::text, day_of_month),
    total_generated = total_generated + 1,
    updated_at = now()
  where id = t.id;

  return v_tx_id;
end;
$$;

comment on function public.materialize_recurring_occurrence(uuid) is
  'Materializa a próxima ocorrência do template. Devolve null e só avança a fronteira quando a data já está ocupada.';

-- ===========================================================
-- 2. Backfill conta o que gerou, não o que tentou
-- ===========================================================

create or replace function public.backfill_recurring_template(
  p_template_id uuid,
  p_through_date date default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_loops int := 0;
  v_through date;
  v_company uuid;
  v_tx uuid;
begin
  -- `security definer` passa por cima da RLS, então a permissão é checada à
  -- mão. Sem `auth.uid()` o chamador é o cron/service role.
  select rt.company_id into v_company
    from recurring_templates rt where rt.id = p_template_id;

  if auth.uid() is not null and not public.has_company_access(v_company) then
    raise exception 'Sem acesso ao template %', p_template_id;
  end if;

  if p_through_date is null then
    select case when rt.auto_generate then public.recurring_horizon_date() else current_date end
      into v_through
      from recurring_templates rt
     where rt.id = p_template_id;
  else
    v_through := p_through_date;
  end if;

  if v_through is null then
    return 0;
  end if;

  loop
    exit when (
      select rt.next_run_date > v_through
        or rt.is_active = false
        or (rt.end_date is not null and rt.next_run_date > rt.end_date)
        or (rt.max_occurrences is not null and rt.total_generated >= rt.max_occurrences)
      from recurring_templates rt where rt.id = p_template_id
    );

    v_tx := public.materialize_recurring_occurrence(p_template_id);
    if v_tx is not null then
      v_count := v_count + 1;
    end if;

    -- O teto conta voltas, não gerações: data pulada também precisa terminar.
    v_loops := v_loops + 1;
    if v_loops > 600 then
      raise exception 'Template % passou de 600 ocorrências até %; calendário suspeito',
        p_template_id, v_through;
    end if;
  end loop;

  return v_count;
end;
$$;

-- ===========================================================
-- 3. Âncora do resync passa a olhar a data mais distante ocupada
-- ===========================================================

create or replace function public.resync_recurring_future(p_template_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  t recurring_templates;
  v_removed int;
  v_last date;
  v_next date;
begin
  select * into t from recurring_templates where id = p_template_id;
  if t.id is null then
    return 0;
  end if;

  with removed as (
    delete from transactions tx
     where tx.recurring_template_id = p_template_id
       and tx.status = 'scheduled'
       and tx.deleted_at is null
       and tx.recurring_manually_edited = false
       and tx.paid_amount = 0
       and coalesce(tx.due_date, tx.accrual_date) > current_date
    returning 1
  )
  select count(*)::int into v_removed from removed;

  -- A fronteira vai para depois da data mais distante que o template já ocupa,
  -- competência **ou** vencimento. Olhar só a competência foi o que gerou
  -- duplicata: uma ocorrência com vencimento remarcado para frente ficava
  -- invisível para a âncora e a vaga dela era preenchida de novo.
  select max(greatest(tx.accrual_date, coalesce(tx.due_date, tx.accrual_date)))
    into v_last
    from transactions tx
   where tx.recurring_template_id = p_template_id
     and tx.deleted_at is null;

  if v_last is null then
    v_next := t.start_date;
  else
    v_next := public.advance_recurrence_date(v_last, t.frequency::text, t.day_of_month);
  end if;

  update recurring_templates
     set next_run_date = v_next,
         total_generated = greatest(total_generated - v_removed, 0)
   where id = p_template_id;

  if t.is_active then
    perform public.backfill_recurring_template(
      p_template_id,
      case when t.auto_generate then public.recurring_horizon_date() else current_date end
    );
  end if;

  return v_removed;
end;
$$;

-- ===========================================================
-- 4. Aprovação manual avisa em vez de devolver nada
-- ===========================================================
-- O botão de aprovar espera um lançamento de volta. Devolver null faria a tela
-- comemorar sem ter criado nada.

create or replace function public.approve_recurring_template(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx uuid;
begin
  v_tx := public.materialize_recurring_occurrence(p_template_id);
  if v_tx is null then
    raise exception
      'Já existe lançamento deste template na próxima data prevista; nada foi gerado.';
  end if;
  return v_tx;
end;
$$;
