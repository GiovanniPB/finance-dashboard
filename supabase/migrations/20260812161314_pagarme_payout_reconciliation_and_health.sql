-- =============================================================================
-- pagar.me — Conciliação do saque + visão de saúde do ledger (Fase 3d/3e)
--
-- O SAQUE NÃO VEM DA API. `GET /transfers` responde 401 por allowlist de IP no
-- pagar.me, e o egresso do Edge Runtime não é fixo (ver pagarme-api-contract.md).
-- Isso acabou melhorando o desenho: o saque já é observável nos dois lados que
-- controlamos — a TED no extrato bancário e o saldo do recebedor na API. Então
-- ele deixa de ser ingestão e passa a ser CONCILIAÇÃO.
--
-- É aqui que o spike morre de fato: a TED que hoje é lançada como receita
-- (`1.01`) passa a ser uma transferência gateway → banco, que `v_transactions`
-- exclui da DRE/fluxo e mantém no saldo por conta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- pagarme_reconcile_payout — transforma a TED do extrato em transferência
--
-- Idempotente por (conta pagar.me, external_ref): reprocessar a mesma linha do
-- extrato devolve o saque já criado em vez de duplicar a transferência.
-- -----------------------------------------------------------------------------
create or replace function public.pagarme_reconcile_payout(
  p_company_id uuid,
  p_amount numeric,
  p_funded_on date,
  p_external_ref text,
  p_bank_account_id uuid default null,
  p_statement_line_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.pagarme_ledger_settings%rowtype;
  v_target   uuid;
  v_group    uuid;
  v_payout   uuid;
begin
  if not public.has_company_write_access(p_company_id) then
    raise exception 'sem permissão de escrita nesta empresa' using errcode = 'insufficient_privilege';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'valor do saque deve ser maior que zero' using errcode = 'check_violation';
  end if;

  if p_external_ref is null or length(trim(p_external_ref)) = 0 then
    raise exception 'referência do saque é obrigatória (chave de idempotência)'
      using errcode = 'check_violation';
  end if;

  select * into v_settings
  from public.pagarme_ledger_settings
  where company_id = p_company_id
  order by created_at
  limit 1;

  if v_settings.id is null or v_settings.gateway_bank_account_id is null then
    raise exception 'empresa sem carteira de gateway configurada (use pagarme_setup_gateway_account)'
      using errcode = 'no_data_found';
  end if;

  -- já conciliado? devolve o mesmo saque (a UI pode reenviar sem medo)
  select id into v_payout
  from public.pagarme_payouts
  where pagarme_account_id = v_settings.pagarme_account_id
    and external_ref = p_external_ref;
  if v_payout is not null then
    return v_payout;
  end if;

  v_target := coalesce(p_bank_account_id, v_settings.payout_bank_account_id);
  if v_target is null then
    raise exception 'informe a conta bancária de destino (ou configure payout_bank_account_id)'
      using errcode = 'no_data_found';
  end if;

  -- As duas pernas da transferência. `create_transfer` é security invoker e já
  -- valida que as duas contas são da empresa; as pernas carregam
  -- `transfer_group_id`, que é o que mantém o saque fora da DRE/fluxo.
  v_group := public.create_transfer(
    p_company_id,
    v_settings.gateway_bank_account_id,
    v_target,
    p_amount,
    p_funded_on,
    'Saque pagar.me',
    p_notes
  );

  insert into public.pagarme_payouts (
    organization_id, pagarme_account_id, pagarme_recipient_id, company_id,
    external_ref, amount, status, funded_on,
    bank_account_id, statement_line_id, transfer_group_id, created_by
  ) values (
    v_settings.organization_id, v_settings.pagarme_account_id, null, p_company_id,
    p_external_ref, p_amount, 'reconciled', p_funded_on,
    v_target, p_statement_line_id, v_group, auth.uid()
  )
  returning id into v_payout;

  return v_payout;
end;
$$;

revoke all on function public.pagarme_reconcile_payout(uuid, numeric, date, text, uuid, uuid, text)
  from public, anon;
grant execute on function public.pagarme_reconcile_payout(uuid, numeric, date, text, uuid, uuid, text)
  to authenticated;

comment on function public.pagarme_reconcile_payout(uuid, numeric, date, text, uuid, uuid, text) is
  'Concilia a TED do pagar.me como transferência gateway → banco (fora da DRE/fluxo) e registra o saque. Idempotente por external_ref.';

-- =============================================================================
-- v_pagarme_ledger_health — os furos que precisam aparecer
--
-- Um ledger que espelha terceiro falha em silêncio se ninguém olhar. Esta view
-- reúne, por empresa, tudo que indica ingestão incompleta ou projeção divergente.
-- Cada linha é um problema acionável; ledger saudável devolve zero linhas.
-- =============================================================================
create or replace view public.v_pagarme_ledger_health
with (security_invoker = true) as

-- 1. Recebível sem competência: sem `accrual_at` não há como classificar o mês,
--    e a projeção o ignora — ou seja, é receita que não vira lançamento.
select
  r.company_id,
  'receivable_without_accrual'::text as issue,
  count(*)::int                      as occurrences,
  sum(r.amount)::numeric             as amount,
  'Recebível sem data de competência: não entra na projeção contábil'::text as detail
from public.pagarme_receivables r
where r.sale_accrual_at is null
group by r.company_id

union all

-- 2. Recebível órfão: existe o dinheiro, não existe a venda. Não bloqueia a
--    projeção (o payable é auto-suficiente), mas some do dashboard de vendas.
select
  r.company_id,
  'receivable_without_charge',
  count(*)::int,
  sum(r.amount)::numeric,
  'Recebível sem a cobrança correspondente no ledger: rode o backfill da janela'
from public.pagarme_receivables r
where r.pagarme_charge_id is not null
  and not exists (
    select 1 from public.pagarme_charges c
    where c.pagarme_account_id = r.pagarme_account_id
      and c.pagarme_charge_id = r.pagarme_charge_id
  )
group by r.company_id

union all

-- 3. Recebível vencido e ainda pendente: o sweep de maturidade deveria ter
--    resolvido. Persistindo, é sinal de sync parado ou de chave de API inválida.
select
  r.company_id,
  'receivable_overdue_unsettled',
  count(*)::int,
  sum(r.amount)::numeric,
  'Recebível com liquidação vencida há mais de 5 dias e ainda em waiting_funds'
from public.pagarme_receivables r
where r.status = 'waiting_funds'
  and r.expected_payment_date < current_date - 5
group by r.company_id

union all

-- 4. Antecipação detectada: não é erro, é informação — a data mudou em relação à
--    primeira sincronização. Aparece aqui para ninguém ser surpreendido por um
--    recebível que "andou" de mês.
select
  r.company_id,
  'receivable_anticipated',
  count(*)::int,
  sum(r.anticipation_fee)::numeric,
  'Recebível antecipado (data mudou desde a 1ª sincronização); custo em 7.10'
from public.pagarme_receivables r
where r.first_seen_payment_date is not null
  and r.expected_payment_date is distinct from r.first_seen_payment_date
group by r.company_id

union all

-- 5. Recebível liquidado sem projeção: dinheiro que entrou e não virou
--    lançamento. É o furo mais grave — receita faltando na DRE.
select
  r.company_id,
  'settled_without_projection',
  count(*)::int,
  sum(r.amount)::numeric,
  'Recebível liquidado após o corte sem lançamento correspondente: rode pagarme_project_ledger'
from public.pagarme_receivables r
join public.pagarme_ledger_settings s
  on s.company_id = r.company_id and s.pagarme_account_id = r.pagarme_account_id
where s.enabled = true
  and r.status = 'paid'
  and r.type = 'credit'
  and r.transaction_id is null
  and r.expected_payment_date >= s.cutover_date
group by r.company_id

union all

-- 6. Receita de origem pagar.me lançada à MÃO depois do corte, convivendo com a
--    projeção: é exatamente o cenário de RECEITA EM DOBRO que o corte (D4)
--    pretende evitar.
select
  t.company_id,
  'manual_pagarme_revenue_after_cutover',
  count(*)::int,
  sum(t.amount)::numeric,
  'Lançamento manual com aparência de receita pagar.me depois do corte: risco de duplicidade'
from public.transactions t
join public.chart_of_accounts a on a.id = t.account_id
join public.pagarme_ledger_settings s on s.company_id = t.company_id
where s.enabled = true
  and t.deleted_at is null
  and t.pagarme_projection_key is null
  and t.transfer_group_id is null
  and t.direction = 'inflow'
  and a.kind = 'revenue'
  and coalesce(t.cash_date, t.due_date, t.accrual_date) >= s.cutover_date
  and t.description ~* 'pagar[ ._-]?me'
group by t.company_id;

comment on view public.v_pagarme_ledger_health is
  'Furos acionáveis do ledger do pagar.me (ingestão incompleta, projeção faltante, risco de receita duplicada). Ledger saudável = zero linhas.';

-- =============================================================================
-- pagarme_reconcile_month — o relatório que autoriza o corte
--
-- Compara, para um mês: o que liquidou (nosso ledger), o que a projeção lançou e
-- o que saiu por saque. Nenhum corte deve ser feito sem isto fechando.
-- =============================================================================
create or replace function public.pagarme_reconcile_month(
  p_company_id uuid,
  p_month date
)
returns table (
  metric text,
  value numeric,
  detail text
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', p_month)::date as mes_inicio,
           (date_trunc('month', p_month) + interval '1 month - 1 day')::date as mes_fim
  ),
  liquidado as (
    select coalesce(sum(r.amount), 0) as bruto,
           coalesce(sum(r.fee + r.anticipation_fee + r.fraud_coverage_fee), 0) as taxas
    from public.pagarme_receivables r, bounds b
    where r.company_id = p_company_id
      and r.status = 'paid'
      and r.type = 'credit'
      and r.settled_on between b.mes_inicio and b.mes_fim
  ),
  projetado as (
    select
      coalesce(sum(t.amount) filter (where t.metadata->>'kind' = 'revenue'), 0) as receita,
      coalesce(sum(t.amount) filter (where t.metadata->>'kind' in ('fee', 'anticipation')), 0) as taxas
    from public.transactions t, bounds b
    where t.company_id = p_company_id
      and t.pagarme_projection_key is not null
      and t.deleted_at is null
      and t.cash_date between b.mes_inicio and b.mes_fim
  ),
  saques as (
    select coalesce(sum(p.amount), 0) as total
    from public.pagarme_payouts p, bounds b
    where p.company_id = p_company_id
      and p.funded_on between b.mes_inicio and b.mes_fim
  )
  select 'liquidado_bruto', l.bruto,
         'Recebíveis liquidados no mês (bruto)' from liquidado l
  union all
  select 'liquidado_taxas', l.taxas,
         'Taxas dos recebíveis liquidados no mês' from liquidado l
  union all
  select 'liquidado_liquido', l.bruto - l.taxas,
         'Líquido que entrou na carteira do gateway' from liquidado l
  union all
  select 'projetado_receita', p.receita,
         'Receita lançada pela projeção com caixa no mês' from projetado p
  union all
  select 'projetado_taxas', p.taxas,
         'Taxas lançadas pela projeção com caixa no mês' from projetado p
  union all
  select 'saques', s.total,
         'Saques conciliados (gateway -> banco) no mês' from saques s
  union all
  -- as duas linhas que precisam ser ZERO
  select 'divergencia_receita', l.bruto - p.receita,
         'Liquidado bruto menos receita projetada (deve ser zero)'
  from liquidado l, projetado p
  union all
  select 'divergencia_taxas', l.taxas - p.taxas,
         'Taxas liquidadas menos taxas projetadas (deve ser zero)'
  from liquidado l, projetado p;
$$;

grant execute on function public.pagarme_reconcile_month(uuid, date) to authenticated;

comment on function public.pagarme_reconcile_month(uuid, date) is
  'Concilia o mês: liquidado x projetado x saques. As linhas divergencia_* devem ser zero antes de fechar o mês.';
