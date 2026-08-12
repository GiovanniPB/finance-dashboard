-- =============================================================================
-- pagar.me — suporte de dados para a UI de recebíveis e conciliação (Fase 4)
--
-- A projeção da Fase 3 já cria os lançamentos, mas eles chegam nas telas
-- existentes sem se identificar: em "A Receber" uma linha de venda do pagar.me é
-- indistinguível de um título lançado à mão, e no forecast a entrada some no
-- meio das outras. Aqui damos à UI o que falta para separar origem e para abrir
-- o detalhe de um lançamento agregado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. v_bills passa a expor a origem
--
-- `create or replace` aceita colunas ACRESCENTADAS AO FIM — por isso a nova vem
-- depois de `days_overdue`, sem reordenar nada (reordenar exigiria drop, e a view
-- é lida por várias telas).
-- -----------------------------------------------------------------------------
create or replace view public.v_bills as
select
  t.id,
  t.company_id,
  t.direction,
  t.status,
  t.amount,
  t.paid_amount,
  greatest(t.amount + t.interest_amount + t.fine_amount - t.discount_amount - t.paid_amount, 0)
    as open_amount,
  t.interest_amount,
  t.fine_amount,
  t.discount_amount,
  t.accrual_date,
  t.due_date,
  t.cash_date,
  t.description,
  t.document_ref,
  t.account_id,
  t.cost_center_id,
  t.bank_account_id,
  t.counterparty_id,
  t.installment_n,
  t.installment_total,
  t.parent_id,
  t.tags,
  t.notes,
  t.created_at,
  t.updated_at,
  case
    when t.status = 'canceled' then 'canceled'
    when t.status in ('settled', 'reconciled') then 'paid'
    when t.paid_amount > 0 and t.paid_amount < t.amount then 'partial'
    when t.due_date is not null and t.due_date < current_date then 'overdue'
    else 'open'
  end as effective_status,
  case
    when t.due_date is null then null
    else (current_date - t.due_date)::int
  end as days_overdue,
  -- NOVO: a chave da projeção. Não-nula = título gerado a partir dos recebíveis
  -- do pagar.me (agrega N parcelas de um dia de liquidação); nula = lançamento
  -- humano. É o que permite filtrar por origem e abrir o detalhe.
  t.pagarme_projection_key
from public.transactions t
where t.deleted_at is null;

comment on view public.v_bills is
  'Títulos (AP+AR) com effective_status e days_overdue. pagarme_projection_key não-nulo identifica a origem pagar.me.';

-- -----------------------------------------------------------------------------
-- 2. pagarme_receivables_of_transaction — o detalhe por trás do agregado
--
-- Um lançamento da projeção representa VÁRIAS parcelas (todas as que liquidam no
-- mesmo dia, na mesma competência). Sem isto a UI mostraria um valor sem lastro
-- verificável; com isto o drawer abre a lista de vendas que o compõem.
--
-- `security invoker`: a RLS de `pagarme_receivables` (empresa que recebe) e a de
-- `pagarme_charges` (empresa dona da conta) recortam naturalmente. Um usuário que
-- vê o título mas não a base comercial recebe as parcelas sem o nome do cliente —
-- que é o comportamento correto de privacidade, não um bug.
-- -----------------------------------------------------------------------------
create or replace function public.pagarme_receivables_of_transaction(p_transaction_id uuid)
returns table (
  receivable_id uuid,
  pagarme_charge_id text,
  installment int,
  installments_total int,
  amount numeric,
  fee_total numeric,
  net_amount numeric,
  status text,
  expected_payment_date date,
  anticipated boolean,
  sale_paid_at timestamptz,
  customer_name text,
  payment_method text,
  card_brand text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.id,
    r.pagarme_charge_id,
    r.installment,
    c.installments,
    r.amount,
    r.fee + r.anticipation_fee + r.fraud_coverage_fee,
    r.net_amount,
    r.status,
    r.expected_payment_date,
    -- antecipado = a data mudou desde a 1ª sincronização (a API não devolve a
    -- data original, então a comparação com o valor congelado é a única pista)
    r.first_seen_payment_date is not null
      and r.expected_payment_date is distinct from r.first_seen_payment_date,
    r.sale_accrual_at,
    cust.name,
    coalesce(r.payment_method, c.payment_method),
    c.card_brand
  from public.pagarme_receivables r
  left join public.pagarme_charges c
    on c.pagarme_account_id = r.pagarme_account_id
   and c.pagarme_charge_id = r.pagarme_charge_id
  left join public.pagarme_customers cust
    on cust.pagarme_account_id = c.pagarme_account_id
   and cust.pagarme_customer_id = c.pagarme_customer_id
  where r.transaction_id = p_transaction_id
  order by r.expected_payment_date, r.pagarme_charge_id, r.installment;
$$;

grant execute on function public.pagarme_receivables_of_transaction(uuid) to authenticated;

comment on function public.pagarme_receivables_of_transaction(uuid) is
  'Parcelas do pagar.me que compõem um lançamento agregado da projeção — o lastro do valor mostrado em A Receber.';

-- -----------------------------------------------------------------------------
-- 3. forecast_pagarme_inflow — a série separada do forecast
--
-- Nova função em vez de mexer em `forecast_cashflow_daily`: mudar o tipo de
-- retorno daquela quebraria a tela que já existe. A UI sobrepõe esta série e
-- subtrai da entrada total para mostrar "recebíveis pagar.me" x "outras
-- entradas".
--
-- Lê a PROJEÇÃO (`transactions`), não os recebíveis, de propósito: o forecast é
-- sobre o que está lançado no financeiro. Recebível existente mas ainda não
-- projetado aparece como divergência em `v_pagarme_ledger_health`, não como
-- entrada fantasma no fluxo.
-- -----------------------------------------------------------------------------
create or replace function public.forecast_pagarme_inflow(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  day date,
  inflow_pagarme numeric,
  fees_pagarme numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d::date as day,
    coalesce((
      select sum(t.amount - t.paid_amount)
      from public.transactions t
      where t.company_id = p_company_id
        and t.deleted_at is null
        and t.pagarme_projection_key is not null
        and t.direction = 'inflow'
        and t.status in ('pending', 'scheduled')
        and coalesce(t.cash_date, t.due_date, t.accrual_date) = d::date
    ), 0) as inflow_pagarme,
    coalesce((
      select sum(t.amount - t.paid_amount)
      from public.transactions t
      where t.company_id = p_company_id
        and t.deleted_at is null
        and t.pagarme_projection_key is not null
        and t.direction = 'outflow'
        and t.status in ('pending', 'scheduled')
        and coalesce(t.cash_date, t.due_date, t.accrual_date) = d::date
    ), 0) as fees_pagarme
  from generate_series(p_from, p_to, interval '1 day') d
  order by 1;
$$;

grant execute on function public.forecast_pagarme_inflow(uuid, date, date) to authenticated;

comment on function public.forecast_pagarme_inflow(uuid, date, date) is
  'Série diária das entradas (e taxas) já projetadas do pagar.me, para destacar no forecast a parcela do caixa futuro que vem das vendas.';

-- -----------------------------------------------------------------------------
-- 4. pagarme_gateway_accounts — as carteiras de gateway da empresa
--
-- A tela de conciliação precisa saber se a empresa tem carteira configurada
-- (senão o registro de saque não faz sentido) e qual é a conta de destino padrão.
-- -----------------------------------------------------------------------------
create or replace function public.pagarme_gateway_accounts(p_company_id uuid)
returns table (
  settings_id uuid,
  pagarme_account_id uuid,
  account_label text,
  gateway_bank_account_id uuid,
  gateway_nickname text,
  payout_bank_account_id uuid,
  payout_nickname text,
  cutover_date date,
  enabled boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    s.pagarme_account_id,
    pa.label,
    s.gateway_bank_account_id,
    gw.nickname,
    s.payout_bank_account_id,
    dest.nickname,
    s.cutover_date,
    s.enabled
  from public.pagarme_ledger_settings s
  join public.pagarme_accounts pa on pa.id = s.pagarme_account_id
  left join public.bank_accounts gw on gw.id = s.gateway_bank_account_id
  left join public.bank_accounts dest on dest.id = s.payout_bank_account_id
  where s.company_id = p_company_id
  order by pa.label;
$$;

grant execute on function public.pagarme_gateway_accounts(uuid) to authenticated;
