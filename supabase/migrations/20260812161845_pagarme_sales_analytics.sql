-- =============================================================================
-- pagar.me — RPCs de análise para o dashboard de vendas (Fase 5)
--
-- TODAS são `security invoker`: a RLS do chamador é que recorta, seguindo a
-- convenção do PR de permissões. Nenhuma lê `sales_events` (que guarda PII crua e
-- é restrita a super admin) — o dashboard lê o ledger normalizado.
--
-- DOIS ESCOPOS, porque o domínio tem dois:
--
--  · métrica de VENDA (GMV, ticket, aprovação, meio de pagamento) é por CONTA
--    pagar.me — a venda pertence a quem vendeu;
--  · métrica de DINHEIRO (receita por empresa, recebíveis, taxas) é por EMPRESA —
--    o dinheiro pertence a quem recebe o split.
--
-- Misturar os dois daria número errado no caso real do grupo, em que a RCO recebe
-- dentro da conta da Jimmy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- sales_overview — a linha de KPIs
--
-- `approval_rate` usa TODAS as cobranças da janela (pagas + recusadas), por isso
-- o ledger ingere cobrança recusada: sem ela não há denominador.
-- -----------------------------------------------------------------------------
create or replace function public.sales_overview(
  p_from date,
  p_to date,
  p_account_id uuid default null
)
returns table (
  gmv numeric,
  sales_count int,
  avg_ticket numeric,
  refunded numeric,
  net_sales numeric,
  approval_rate numeric,
  attempts_count int,
  failed_count int,
  installments_avg numeric,
  customers_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with janela as (
    select c.*
    from public.pagarme_charges c
    where (p_account_id is null or c.pagarme_account_id = p_account_id)
      -- tentativa é datada pela CRIAÇÃO; a venda, pelo pagamento (ver `pagas`)
      and c.charge_created_at >= p_from::timestamptz
      and c.charge_created_at < (p_to + 1)::timestamptz
  ),
  pagas as (
    select c.*
    from public.pagarme_charges c
    where (p_account_id is null or c.pagarme_account_id = p_account_id)
      and c.status in ('paid', 'refunded', 'chargedback', 'partial_canceled')
      and c.paid_at >= p_from::timestamptz
      and c.paid_at < (p_to + 1)::timestamptz
  )
  select
    coalesce((select sum(amount) from pagas), 0),
    (select count(*) from pagas)::int,
    case when (select count(*) from pagas) > 0
         then round((select sum(amount) from pagas) / (select count(*) from pagas), 2)
         else 0 end,
    coalesce((select sum(refunded_amount) from pagas), 0),
    coalesce((select sum(amount - refunded_amount) from pagas), 0),
    case when (select count(*) from janela) > 0
         then round(
           100.0 * (select count(*) from janela where status = 'paid')
                 / (select count(*) from janela), 2)
         else null end,
    (select count(*) from janela)::int,
    (select count(*) from janela where status = 'failed')::int,
    (select round(avg(installments), 2) from pagas where installments is not null),
    (select count(distinct pagarme_customer_id) from pagas where pagarme_customer_id is not null)::int;
$$;

-- -----------------------------------------------------------------------------
-- sales_timeseries — evolução (dia | semana | mês)
--
-- Série contínua: `generate_series` garante bucket vazio no gráfico em vez de
-- pular o período (o que desenharia uma tendência falsa).
-- -----------------------------------------------------------------------------
create or replace function public.sales_timeseries(
  p_from date,
  p_to date,
  p_grain text default 'day',
  p_account_id uuid default null
)
returns table (
  bucket date,
  gmv numeric,
  sales_count int,
  avg_ticket numeric,
  failed_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with unidade as (
    select case p_grain when 'month' then 'month' when 'week' then 'week' else 'day' end as u
  ),
  buckets as (
    select date_trunc((select u from unidade), d)::date as bucket
    from generate_series(p_from::timestamptz, p_to::timestamptz, interval '1 day') d
    group by 1
  ),
  vendas as (
    select
      date_trunc((select u from unidade), c.paid_at)::date as bucket,
      sum(c.amount) as gmv,
      count(*)::int as sales_count
    from public.pagarme_charges c
    where (p_account_id is null or c.pagarme_account_id = p_account_id)
      and c.status in ('paid', 'refunded', 'chargedback', 'partial_canceled')
      and c.paid_at >= p_from::timestamptz
      and c.paid_at < (p_to + 1)::timestamptz
    group by 1
  ),
  recusadas as (
    select
      date_trunc((select u from unidade), c.charge_created_at)::date as bucket,
      count(*)::int as failed_count
    from public.pagarme_charges c
    where (p_account_id is null or c.pagarme_account_id = p_account_id)
      and c.status = 'failed'
      and c.charge_created_at >= p_from::timestamptz
      and c.charge_created_at < (p_to + 1)::timestamptz
    group by 1
  )
  select
    b.bucket,
    coalesce(v.gmv, 0),
    coalesce(v.sales_count, 0),
    case when coalesce(v.sales_count, 0) > 0 then round(v.gmv / v.sales_count, 2) else 0 end,
    coalesce(r.failed_count, 0)
  from buckets b
  left join vendas v on v.bucket = b.bucket
  left join recusadas r on r.bucket = b.bucket
  order by b.bucket;
$$;

-- -----------------------------------------------------------------------------
-- sales_breakdown — composição por dimensão
--
-- Uma RPC com `p_dimension` em vez de seis: o formato de saída é o mesmo
-- (rótulo + valor + contagem) e a UI só troca o parâmetro.
--   payment_method | installments | plan | brand | company
-- `company` é a única que sai dos RECEBÍVEIS (é dinheiro, não venda) — é a visão
-- do split entre as empresas do grupo.
-- -----------------------------------------------------------------------------
create or replace function public.sales_breakdown(
  p_from date,
  p_to date,
  p_dimension text default 'payment_method',
  p_account_id uuid default null
)
returns table (
  label text,
  amount numeric,
  sales_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with pagas as (
    select c.*
    from public.pagarme_charges c
    where (p_account_id is null or c.pagarme_account_id = p_account_id)
      and c.status in ('paid', 'refunded', 'chargedback', 'partial_canceled')
      and c.paid_at >= p_from::timestamptz
      and c.paid_at < (p_to + 1)::timestamptz
  )
  select label, amount, sales_count from (
    select
      coalesce(payment_method, 'desconhecido') as label,
      sum(amount) as amount,
      count(*)::int as sales_count
    from pagas where p_dimension = 'payment_method'
    group by 1

    union all
    select
      case when installments is null then 'desconhecido'
           when installments = 1 then 'à vista'
           else installments || 'x' end,
      sum(amount), count(*)::int
    from pagas where p_dimension = 'installments'
    group by 1

    union all
    select coalesce(pagarme_plan_id, 'avulso'), sum(amount), count(*)::int
    from pagas where p_dimension = 'plan'
    group by 1

    union all
    select coalesce(card_brand, 'não-cartão'), sum(amount), count(*)::int
    from pagas where p_dimension = 'brand'
    group by 1

    -- dinheiro por empresa: sai dos recebíveis, que é onde o split existe
    union all
    select
      coalesce(co.trade_name, co.legal_name),
      sum(r.amount),
      count(distinct r.pagarme_charge_id)::int
    from public.pagarme_receivables r
    join public.companies co on co.id = r.company_id
    where p_dimension = 'company'
      and r.type = 'credit'
      and (p_account_id is null or r.pagarme_account_id = p_account_id)
      and r.sale_accrual_at >= p_from::timestamptz
      and r.sale_accrual_at < (p_to + 1)::timestamptz
    group by 1
  ) t
  order by amount desc;
$$;

-- -----------------------------------------------------------------------------
-- sales_customers — novos x recorrentes
--
-- "Novo" = a primeira compra do cliente caiu na janela. Comparado com a primeira
-- compra REGISTRADA no ledger, então um backfill curto pode marcar como novo
-- quem é antigo — por isso o retorno inclui `ledger_since`, para a UI avisar.
-- -----------------------------------------------------------------------------
create or replace function public.sales_customers(
  p_from date,
  p_to date,
  p_account_id uuid default null
)
returns table (
  new_customers int,
  returning_customers int,
  new_revenue numeric,
  returning_revenue numeric,
  repeat_rate numeric,
  ledger_since timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select c.pagarme_account_id, c.pagarme_customer_id, c.amount, c.paid_at
    from public.pagarme_charges c
    where (p_account_id is null or c.pagarme_account_id = p_account_id)
      and c.status in ('paid', 'refunded', 'chargedback', 'partial_canceled')
      and c.pagarme_customer_id is not null
  ),
  primeira as (
    select pagarme_account_id, pagarme_customer_id, min(paid_at) as first_at
    from base group by 1, 2
  ),
  janela as (
    select b.*, p.first_at
    from base b
    join primeira p
      on p.pagarme_account_id = b.pagarme_account_id
     and p.pagarme_customer_id = b.pagarme_customer_id
    where b.paid_at >= p_from::timestamptz
      and b.paid_at < (p_to + 1)::timestamptz
  )
  select
    count(distinct case when first_at >= p_from::timestamptz then pagarme_customer_id end)::int,
    count(distinct case when first_at < p_from::timestamptz then pagarme_customer_id end)::int,
    coalesce(sum(case when first_at >= p_from::timestamptz then amount end), 0),
    coalesce(sum(case when first_at < p_from::timestamptz then amount end), 0),
    case when count(distinct pagarme_customer_id) > 0
         then round(100.0 * count(distinct case when first_at < p_from::timestamptz
                                                then pagarme_customer_id end)
                          / count(distinct pagarme_customer_id), 2)
         else null end,
    (select min(first_at) from primeira)
  from janela;
$$;

-- -----------------------------------------------------------------------------
-- sales_recurrence — recorrência e churn, com as DUAS definições
--
-- Achado da Fase 0: a Jimmy vende assinatura anual; a RCO não usa assinatura
-- nenhuma (vende contrato parcelado). Não existe UMA definição de MRR/churn para
-- o grupo, então a RPC devolve as duas famílias de métrica e a UI rotula qual se
-- aplica:
--
--  · modelo ASSINATURA -> mrr_active, subs_*, churn_rate_logo, involuntary_*
--  · modelo PARCELADO  -> contracted_receivables (backlog contratado, que é o
--    equivalente honesto de "receita recorrente" quando não há objeto assinatura)
--
-- `has_subscriptions` diz qual bloco tem significado para o escopo consultado.
-- -----------------------------------------------------------------------------
create or replace function public.sales_recurrence(
  p_from date,
  p_to date,
  p_account_id uuid default null
)
returns table (
  has_subscriptions boolean,
  mrr_active numeric,
  subs_active int,
  subs_new int,
  subs_canceled int,
  churn_rate_logo numeric,
  involuntary_failed int,
  contracted_receivables numeric,
  contracted_installments int
)
language sql
stable
security invoker
set search_path = public
as $$
  with subs as (
    select s.*
    from public.pagarme_subscriptions s
    where (p_account_id is null or s.pagarme_account_id = p_account_id)
  ),
  ativos_inicio as (
    -- base do churn: quem estava ativo no começo da janela
    select count(*)::int as n
    from subs
    where start_at < p_from::timestamptz
      and (canceled_at is null or canceled_at >= p_from::timestamptz)
  ),
  falhas as (
    select count(*)::int as n
    from public.pagarme_charges c
    where (p_account_id is null or c.pagarme_account_id = p_account_id)
      and c.status = 'failed'
      and c.pagarme_subscription_id is not null
      and c.charge_created_at >= p_from::timestamptz
      and c.charge_created_at < (p_to + 1)::timestamptz
  ),
  backlog as (
    select coalesce(sum(r.amount), 0) as total, count(*)::int as parcelas
    from public.pagarme_receivables r
    where (p_account_id is null or r.pagarme_account_id = p_account_id)
      and r.status = 'waiting_funds'
      and r.type = 'credit'
  )
  select
    (select count(*) from subs) > 0,
    coalesce((select sum(mrr) from subs where status = 'active'), 0),
    (select count(*) from subs where status = 'active')::int,
    (select count(*) from subs
      where start_at >= p_from::timestamptz and start_at < (p_to + 1)::timestamptz)::int,
    (select count(*) from subs
      where canceled_at >= p_from::timestamptz and canceled_at < (p_to + 1)::timestamptz)::int,
    case when (select n from ativos_inicio) > 0
         then round(100.0 * (select count(*) from subs
                              where canceled_at >= p_from::timestamptz
                                and canceled_at < (p_to + 1)::timestamptz)
                          / (select n from ativos_inicio), 2)
         else null end,
    (select n from falhas),
    (select total from backlog),
    (select parcelas from backlog);
$$;

-- -----------------------------------------------------------------------------
-- receivables_schedule — a curva do "a receber" por mês de liquidação
--
-- É a materialização do que não existia no sistema: quanto entra, quando, de
-- quem. Escopo por EMPRESA (é dinheiro).
-- -----------------------------------------------------------------------------
create or replace function public.receivables_schedule(
  p_from date,
  p_to date,
  p_company_id uuid default null
)
returns table (
  month_start date,
  gross numeric,
  fees numeric,
  net numeric,
  installments_count int,
  settled_gross numeric,
  pending_gross numeric,
  pending_installments int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc('month', r.expected_payment_date)::date as month_start,
    sum(r.amount)                                       as gross,
    sum(r.fee + r.anticipation_fee + r.fraud_coverage_fee) as fees,
    sum(r.net_amount)                                   as net,
    count(*)::int                                       as installments_count,
    coalesce(sum(r.amount) filter (where r.status = 'paid'), 0)          as settled_gross,
    coalesce(sum(r.amount) filter (where r.status = 'waiting_funds'), 0) as pending_gross,
    -- separado de `installments_count` de propósito: o total do mês inclui
    -- parcelas já liquidadas, e somar aquele para rotular "a receber" inflaria a
    -- contagem (foi o que aconteceu na primeira versão da UI).
    count(*) filter (where r.status = 'waiting_funds')::int as pending_installments
  from public.pagarme_receivables r
  where r.type = 'credit'
    and (p_company_id is null or r.company_id = p_company_id)
    and r.expected_payment_date between p_from and p_to
  group by 1
  order by 1;
$$;

grant execute on function public.sales_overview(date, date, uuid) to authenticated;
grant execute on function public.sales_timeseries(date, date, text, uuid) to authenticated;
grant execute on function public.sales_breakdown(date, date, text, uuid) to authenticated;
grant execute on function public.sales_customers(date, date, uuid) to authenticated;
grant execute on function public.sales_recurrence(date, date, uuid) to authenticated;
grant execute on function public.receivables_schedule(date, date, uuid) to authenticated;

comment on function public.sales_overview(date, date, uuid) is
  'KPIs de venda da janela. approval_rate usa todas as tentativas (por isso o ledger ingere cobrança recusada).';
comment on function public.sales_recurrence(date, date, uuid) is
  'Recorrência nas DUAS definições: assinatura (MRR/churn) e parcelado (backlog contratado). has_subscriptions diz qual se aplica.';
comment on function public.receivables_schedule(date, date, uuid) is
  'Curva de recebíveis por mês de liquidação, separando liquidado de pendente. Escopo por empresa.';
