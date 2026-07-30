-- Transferências entre contas bancárias.
--
-- Até aqui não existia o conceito: mover dinheiro do BTG para o C6 virava dois
-- lançamentos soltos que inflavam receita e despesa na DRE e no fluxo de caixa,
-- mesmo sem nenhum dinheiro ter entrado ou saído da empresa.
--
-- Modelo: a transferência continua sendo DUAS pernas (uma saída na conta de
-- origem, uma entrada na de destino), porque é isso que o extrato de cada banco
-- mostra e é o que faz o saldo de cada conta fechar. O que muda é que as duas
-- passam a compartilhar um `transfer_group_id`, o que permite reconhecê-las.
--
-- Onde entram e onde não entram:
--   • saldo/extrato por conta   → ENTRAM (o banco movimentou de verdade)
--   • DRE, fluxo de caixa, KPIs → NÃO ENTRAM (o caixa da empresa não mudou)
--
-- O recorte é feito nas views v_transactions/v_transactions_signed, de onde
-- todas as RPCs de análise leem. Assim nenhuma análise futura precisa lembrar
-- de filtrar — quem quiser ver transferências lê a tabela direto, como fazem as
-- RPCs de extrato por conta.

alter table public.transactions
  add column if not exists transfer_group_id uuid;

comment on column public.transactions.transfer_group_id is
  'Agrupa as duas pernas de uma transferência entre contas. Null = lançamento comum.';

-- As duas pernas são sempre buscadas juntas.
create index if not exists idx_tx_transfer_group
  on public.transactions(transfer_group_id)
  where transfer_group_id is not null;

-- ===========================================================
-- Conta do plano para as pernas da transferência
-- ===========================================================
-- transactions.account_id é not null, então as pernas precisam de uma conta.
-- Fica abaixo da linha, junto das outras movimentações de capital — ainda que na
-- prática nem chegue à DRE, por causa do filtro nas views.
insert into public.chart_of_accounts_master
  (organization_id, code, name, kind, dre_section, is_summary, below_the_line, sign_hint, sort_order)
select o.id, '9.08', 'Transferência entre Contas', 'capital_movement', 'capital_movements',
       false, true, '+/-', 970
from public.organizations o
on conflict (organization_id, code) do nothing;

-- Propaga para as empresas operacionais existentes (idempotente).
select public.seed_company_chart_of_accounts(c.id)
from public.companies c
where c.is_holding = false;

-- ===========================================================
-- Views de análise passam a ignorar transferências
-- ===========================================================
create or replace view public.v_transactions
  with (security_invoker = true) as
  select * from public.transactions
  where deleted_at is null
    and transfer_group_id is null;

comment on view public.v_transactions is
  'Lançamentos vivos que afetam o resultado/caixa da empresa. Exclui transferências entre contas — para vê-las, consulte a tabela transactions.';

-- drop + create em vez de replace: a view projeta t.*, e as colunas ganhas pela
-- tabela desde a criação dela deslocam a posição de signed_amount — o replace
-- recusa por "cannot change name of view column".
drop view if exists public.v_transactions_signed;

create view public.v_transactions_signed
  with (security_invoker = true) as
  select
    t.*,
    case when t.direction = 'inflow' then t.amount else -t.amount end as signed_amount
  from public.transactions t
  where t.deleted_at is null
    and t.transfer_group_id is null;

comment on view public.v_transactions_signed is
  'Como v_transactions, com signed_amount pronto para SUM. Também exclui transferências.';

-- ===========================================================
-- Criar uma transferência (as duas pernas, atomicamente)
-- ===========================================================
create or replace function public.create_transfer(
  p_company_id uuid,
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_date date,
  p_description text default null,
  p_notes text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group uuid := gen_random_uuid();
  v_account_id uuid;
  v_description text;
  v_from_name text;
  v_to_name text;
begin
  if p_from_account = p_to_account then
    raise exception 'Conta de origem e destino não podem ser a mesma'
      using errcode = 'check_violation';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor da transferência deve ser maior que zero'
      using errcode = 'check_violation';
  end if;

  -- As duas contas precisam ser da empresa informada, senão a transferência
  -- cruzaria empresas e quebraria o saldo das duas.
  select nickname into v_from_name
  from bank_accounts where id = p_from_account and company_id = p_company_id;
  if not found then
    raise exception 'Conta de origem não pertence a esta empresa'
      using errcode = 'foreign_key_violation';
  end if;

  select nickname into v_to_name
  from bank_accounts where id = p_to_account and company_id = p_company_id;
  if not found then
    raise exception 'Conta de destino não pertence a esta empresa'
      using errcode = 'foreign_key_violation';
  end if;

  select id into v_account_id
  from chart_of_accounts
  where company_id = p_company_id and code = '9.08';
  if not found then
    raise exception 'Conta "9.08 Transferência entre Contas" não existe no plano desta empresa'
      using errcode = 'no_data_found';
  end if;

  v_description := coalesce(
    nullif(trim(p_description), ''),
    format('Transferência: %s → %s', v_from_name, v_to_name)
  );

  insert into transactions (
    company_id, account_id, bank_account_id, amount, direction, status,
    accrual_date, cash_date, description, notes, transfer_group_id, created_by
  ) values
    (p_company_id, v_account_id, p_from_account, p_amount, 'outflow', 'settled',
     p_date, p_date, v_description, p_notes, v_group, auth.uid()),
    (p_company_id, v_account_id, p_to_account, p_amount, 'inflow', 'settled',
     p_date, p_date, v_description, p_notes, v_group, auth.uid());

  return v_group;
end;
$$;

comment on function public.create_transfer(uuid, uuid, uuid, numeric, date, text, text) is
  'Cria as duas pernas de uma transferência entre contas da mesma empresa e devolve o transfer_group_id.';

-- ===========================================================
-- Extrato passa a marcar a linha como transferência
-- ===========================================================
-- A coluna is_transfer muda o tipo de retorno, então precisa de drop + create.
drop function if exists public.bank_account_ledger(uuid, date, date);

create function public.bank_account_ledger(
  p_bank_account_id uuid,
  p_from date,
  p_to date
) returns table(
  transaction_id uuid,
  cash_date date,
  description text,
  direction transaction_direction,
  amount numeric,
  signed_amount numeric,
  account_code text,
  account_name text,
  counterparty_name text,
  document_ref text,
  is_transfer boolean,
  running_balance numeric
) language sql security invoker stable set search_path = public as $$
  with opening as (
    select ba.initial_balance + coalesce((
      select sum(case when t.direction = 'inflow' then t.amount else -t.amount end)
      from transactions t
      where t.bank_account_id = ba.id
        and t.deleted_at is null
        and t.status = 'settled'
        and t.cash_date is not null
        and t.cash_date < p_from
        and (ba.initial_balance_date is null or t.cash_date >= ba.initial_balance_date)
    ), 0) as balance
    from bank_accounts ba
    where ba.id = p_bank_account_id
  ),
  lines as (
    select
      t.id,
      t.cash_date,
      t.description,
      t.direction,
      t.amount,
      case when t.direction = 'inflow' then t.amount else -t.amount end as signed_amount,
      coa.code as account_code,
      coa.name as account_name,
      cp.name as counterparty_name,
      t.document_ref,
      t.transfer_group_id is not null as is_transfer,
      t.created_at
    from transactions t
    join bank_accounts ba on ba.id = t.bank_account_id
    left join chart_of_accounts coa on coa.id = t.account_id
    left join counterparties cp on cp.id = t.counterparty_id
    where t.bank_account_id = p_bank_account_id
      and t.deleted_at is null
      and t.status = 'settled'
      and t.cash_date is not null
      and t.cash_date between p_from and p_to
      and (ba.initial_balance_date is null or t.cash_date >= ba.initial_balance_date)
  )
  select
    l.id,
    l.cash_date,
    l.description,
    l.direction,
    l.amount,
    l.signed_amount,
    l.account_code,
    l.account_name,
    l.counterparty_name,
    l.document_ref,
    l.is_transfer,
    (select balance from opening)
      + sum(l.signed_amount) over (order by l.cash_date, l.created_at, l.id
                                   rows between unbounded preceding and current row)
  from lines l
  order by l.cash_date, l.created_at, l.id;
$$;
