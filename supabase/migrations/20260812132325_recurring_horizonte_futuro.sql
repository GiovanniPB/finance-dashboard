-- Recorrências: materializar o futuro num horizonte de 12 meses.
--
-- Antes, o cron diário gerava só até `current_date`, então `next_run_date` era
-- uma fronteira colada em hoje e nada de recorrente existia como linha no
-- futuro. Contas a Pagar lê `v_bills` (view sobre `transactions`), logo o mês
-- que vem simplesmente não aparecia — nem na lista, nem no aging, nem no total.
--
-- A saída é empurrar a fronteira para `current_date + 12 meses`. O motor não
-- muda: `generate_recurring_transactions` já itera até alcançar a data pedida.
-- O que muda é o argumento — e o que isso passa a exigir de disciplina.
--
-- Por que materializar em vez de projetar na view: as linhas precisam ser
-- reais para o financeiro pagar, editar o mês que veio diferente e anexar
-- documento. Projeção não tem `id`. E o custo é contido: DRE, KPIs, fluxo de
-- caixa e despesas por categoria filtram `status in ('settled','reconciled')`,
-- então nada de `scheduled` entra em relatório de realizado. Só AP/AR e o
-- forecast enxergam o futuro — exatamente quem deveria.
--
-- O forecast continua correto sem tocar em nada: ele soma os lançamentos reais
-- e projeta os templates a partir de `next_run_date`. Como a fronteira avança
-- junto com a materialização, nunca há contagem dupla.
--
-- O preço é o drift: com ocorrências futuras já gravadas, mudar o template
-- deixa linhas velhas para trás. Daí os gatilhos de propagação abaixo, e a
-- marca `recurring_manually_edited`, que protege o ajuste feito à mão.

-- ===========================================================
-- 1. Horizonte global
-- ===========================================================
-- Um único lugar para mudar. `immutable` no número de meses para poder ser
-- inlinada; `stable` na data porque depende de `current_date`.

create or replace function public.recurring_horizon_months()
returns int
language sql
immutable
as $$ select 12 $$;

comment on function public.recurring_horizon_months() is
  'Quantos meses de ocorrências recorrentes são materializados à frente. Global.';

create or replace function public.recurring_horizon_date()
returns date
language sql
stable
set search_path = public
as $$
  select (current_date + (public.recurring_horizon_months() || ' months')::interval)::date
$$;

comment on function public.recurring_horizon_date() is
  'Data-limite da materialização de recorrências: hoje + recurring_horizon_months().';

grant execute on function public.recurring_horizon_months() to authenticated;
grant execute on function public.recurring_horizon_date() to authenticated;

-- ===========================================================
-- 2. Marca de edição manual
-- ===========================================================
-- Separa "gerada pelo template e intocada" de "o financeiro ajustou este mês".
-- A propagação só pode passar por cima da primeira.

alter table public.transactions
  add column if not exists recurring_manually_edited boolean not null default false;

comment on column public.transactions.recurring_manually_edited is
  'Ocorrência de recorrência que foi editada à mão. Blinda a linha contra a propagação do template.';

-- A propagação varre por template + status; o índice parcial cobre o caminho
-- quente e fica pequeno porque só indexa o futuro agendado.
create index if not exists idx_tx_recurring_future
  on public.transactions(recurring_template_id, due_date)
  where recurring_template_id is not null
    and status = 'scheduled'
    and deleted_at is null;

-- ===========================================================
-- 3. Quem marca a edição manual
-- ===========================================================
-- Um gatilho, e não a aplicação, porque edição por SQL direto ou por outra
-- tela precisa contar igual. A propagação sinaliza com um GUC local para não
-- marcar as próprias linhas que acabou de reescrever.

create or replace function public.mark_recurring_transaction_edited()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.recurring_propagating', true), '') = 'on' then
    return new;
  end if;
  if new.recurring_template_id is null or new.recurring_manually_edited then
    return new;
  end if;

  -- Só campos de definição. Pagamento (status, paid_amount, cash_date) não é
  -- edição: a linha sai do conjunto propagável por outro critério.
  if (
    new.amount, new.direction, new.account_id, new.cost_center_id,
    new.bank_account_id, new.counterparty_id, new.description, new.notes,
    new.document_ref, new.due_date, new.accrual_date
  ) is distinct from (
    old.amount, old.direction, old.account_id, old.cost_center_id,
    old.bank_account_id, old.counterparty_id, old.description, old.notes,
    old.document_ref, old.due_date, old.accrual_date
  ) then
    new.recurring_manually_edited := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tx_recurring_edited on public.transactions;
create trigger trg_tx_recurring_edited
  before update on public.transactions
  for each row execute function public.mark_recurring_transaction_edited();

-- ===========================================================
-- 4. Refazer o futuro quando o calendário muda
-- ===========================================================
-- Mudar valor dá para corrigir no lugar. Mudar frequência ou dia do mês, não:
-- as datas das ocorrências futuras deixam de existir no calendário novo. Aqui
-- as intocadas são descartadas e regeradas.

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

  -- Recoloca a fronteira logo após a última ocorrência que sobrou. A âncora é
  -- `accrual_date`, não `due_date`: vencimento é negociável e pode ter sido
  -- empurrado à mão, competência é a data que o calendário produziu.
  --
  -- A âncora considera também as linhas editadas à mão que ficaram no futuro.
  -- Isso troca um risco por outro de propósito: nunca gera uma segunda
  -- ocorrência para um período que já tem uma: duplicata em Contas a Pagar
  -- vira pagamento em dobro. O custo é que, se alguém editar uma ocorrência
  -- distante e depois mexer no calendário, os meses entre hoje e ela não
  -- voltam — some uma linha prevista, que é visível e recuperável.
  select max(tx.accrual_date) into v_last
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

comment on function public.resync_recurring_future(uuid) is
  'Descarta as ocorrências futuras intocadas de um template e regera pelo calendário atual.';

-- ===========================================================
-- 5. Propagação do template para as ocorrências futuras
-- ===========================================================

create or replace function public.propagate_recurring_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload_changed boolean;
  v_schedule_changed boolean;
begin
  v_payload_changed := (
    new.amount, new.direction, new.account_id, new.cost_center_id,
    new.bank_account_id, new.counterparty_id, new.description, new.notes,
    new.document_ref
  ) is distinct from (
    old.amount, old.direction, old.account_id, old.cost_center_id,
    old.bank_account_id, old.counterparty_id, old.description, old.notes,
    old.document_ref
  );

  v_schedule_changed := (
    new.frequency, new.interval_count, new.day_of_month, new.start_date,
    new.end_date, new.max_occurrences, new.is_active, new.auto_generate
  ) is distinct from (
    old.frequency, old.interval_count, old.day_of_month, old.start_date,
    old.end_date, old.max_occurrences, old.is_active, old.auto_generate
  );

  if not (v_payload_changed or v_schedule_changed) then
    return null;
  end if;

  perform set_config('app.recurring_propagating', 'on', true);

  if v_schedule_changed then
    -- Cobre desativar, encurtar o fim e virar manual: em todos, o resync
    -- limpa o futuro intocado e só regera o que o estado novo permite.
    perform public.resync_recurring_future(new.id);
  else
    update transactions tx
       set amount = new.amount,
           direction = new.direction,
           account_id = new.account_id,
           cost_center_id = new.cost_center_id,
           bank_account_id = new.bank_account_id,
           counterparty_id = new.counterparty_id,
           description = new.description,
           notes = new.notes,
           document_ref = new.document_ref
     where tx.recurring_template_id = new.id
       and tx.status = 'scheduled'
       and tx.deleted_at is null
       and tx.recurring_manually_edited = false
       and tx.paid_amount = 0
       and coalesce(tx.due_date, tx.accrual_date) > current_date;
  end if;

  perform set_config('app.recurring_propagating', 'off', true);
  return null;
end;
$$;

-- `after` porque mexe em outra tabela; o retorno é ignorado.
drop trigger if exists trg_rec_propagate on public.recurring_templates;
create trigger trg_rec_propagate
  after update on public.recurring_templates
  for each row execute function public.propagate_recurring_template();

-- ===========================================================
-- 6. Excluir o template leva o futuro intocado junto
-- ===========================================================
-- A FK é `on delete set null`: sem isto, as ocorrências futuras sobreviveriam
-- órfãs e sem vínculo, impossíveis de limpar depois. Precisa ser `before`,
-- porque no `after` o vínculo já foi anulado.

create or replace function public.cleanup_recurring_future_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from transactions tx
   where tx.recurring_template_id = old.id
     and tx.status = 'scheduled'
     and tx.deleted_at is null
     and tx.recurring_manually_edited = false
     and tx.paid_amount = 0
     and coalesce(tx.due_date, tx.accrual_date) > current_date;
  return old;
end;
$$;

drop trigger if exists trg_rec_cleanup_delete on public.recurring_templates;
create trigger trg_rec_cleanup_delete
  before delete on public.recurring_templates
  for each row execute function public.cleanup_recurring_future_on_delete();

-- ===========================================================
-- 7. Geradores passam a mirar o horizonte
-- ===========================================================
-- Só o padrão muda. O teto de iterações é rede de segurança: se algum dia
-- `advance_recurrence_date` devolver a mesma data, o loop viraria geração
-- infinita de lançamentos em vez de um erro visível.

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
  v_through date;
  v_company uuid;
begin
  -- `security definer` passa por cima da RLS, então a permissão precisa ser
  -- checada à mão: sem isto, qualquer usuário autenticado materializaria as
  -- recorrências de outra empresa passando o id do template. Sem `auth.uid()`
  -- o chamador é o cron/service role, que é justamente quem deve rodar isto
  -- para todo mundo — e o grant só existe para `authenticated`, então anônimo
  -- não chega aqui.
  select rt.company_id into v_company
    from recurring_templates rt where rt.id = p_template_id;

  if auth.uid() is not null and not public.has_company_access(v_company) then
    raise exception 'Sem acesso ao template %', p_template_id;
  end if;

  -- Sem data explícita: automático vai até o horizonte, manual para em hoje —
  -- materializar o futuro de um template manual atropelaria o contrato de
  -- "você aprova cada ocorrência".
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
    perform materialize_recurring_occurrence(p_template_id);
    v_count := v_count + 1;
    if v_count > 600 then
      raise exception 'Template % gerou mais de 600 ocorrências até %; calendário suspeito',
        p_template_id, v_through;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.generate_recurring_transactions(
  p_through_date date default null
)
returns table (template_id uuid, generated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_count int;
  v_through date := coalesce(p_through_date, public.recurring_horizon_date());
begin
  for t in
    select id from recurring_templates
    where is_active = true
      and auto_generate = true
      and next_run_date <= v_through
      and (end_date is null or next_run_date <= end_date)
  loop
    v_count := public.backfill_recurring_template(t.id, v_through);
    if v_count > 0 then
      template_id := t.id;
      generated_count := v_count;
      return next;
    end if;
  end loop;
end;
$$;

comment on function public.generate_recurring_transactions(date) is
  'Materializa as recorrências automáticas até a data pedida (padrão: o horizonte).';

-- Sem grant para `authenticated`: só os gatilhos precisam chamar, e eles rodam
-- no contexto do definidor. Expor uma função que apaga e regera lançamentos
-- direto pela API seria superfície à toa.
revoke all on function public.resync_recurring_future(uuid) from public;

-- ===========================================================
-- 8. Congelar as ocorrências futuras que já divergem do template
-- ===========================================================
-- Há lançamentos gerados antes desta migration cujo vencimento foi ajustado à
-- mão (vencimento diferente da competência) ou cujo valor não bate mais com o
-- template. Sem esta marca, a primeira edição de template passaria por cima
-- desse trabalho manual. Marcar é conservador: no máximo alguém perde uma
-- propagação e reedita a linha.

update public.transactions tx
   set recurring_manually_edited = true
  from public.recurring_templates rt
 where rt.id = tx.recurring_template_id
   and tx.deleted_at is null
   and tx.status = 'scheduled'
   and coalesce(tx.due_date, tx.accrual_date) > current_date
   and (tx.due_date is distinct from tx.accrual_date or tx.amount <> rt.amount);

-- ===========================================================
-- 9. Cron diário e primeira carga
-- ===========================================================

do $$
begin
  perform cron.unschedule('generate-recurring-daily')
  where exists (select 1 from cron.job where jobname = 'generate-recurring-daily');
exception when others then null;
end $$;

select cron.schedule(
  'generate-recurring-daily',
  '0 6 * * *',
  $cmd$ select public.generate_recurring_transactions(public.recurring_horizon_date()); $cmd$
);

-- Primeira carga junto da migration: sem isto o AP só mostraria o futuro
-- depois do cron das 06:00 UTC do dia seguinte.
select public.generate_recurring_transactions(public.recurring_horizon_date());
