-- =============================================================================
-- pagar.me — Write-back financeiro (Fase 3)
-- Doc: docs/integrations/pagarme-sales-plan.md (decisões D1–D5)
--
-- O QUE ESTA MIGRATION RESOLVE
--
-- Hoje um mês inteiro de vendas entra como UM lançamento de receita, na data em
-- que a TED cai (`PLATAFORMA RCO - pagar-me`, R$ 21k–152k). Isso produz três
-- erros de uma vez: o caixa vira um serrote, a receita é líquida disfarçada de
-- bruta (a taxa de adquirência não existe na DRE) e os R$ 2,5 milhões de
-- recebíveis contratados são invisíveis.
--
-- A correção tem três peças:
--
--  1. A carteira do gateway passa a ser uma CONTA (`payment_gateway`). A receita
--     é reconhecida no dia de cada liquidação, na conta do gateway.
--  2. O saque deixa de ser receita e vira TRANSFERÊNCIA (gateway → banco), que o
--     recorte de `v_transactions` já mantém fora da DRE/fluxo. **É isso que mata
--     o spike** — sem lógica nova, só classificando o fato pelo que ele é.
--  3. A taxa sai do implícito e vira despesa financeira própria (7.09/7.10), e
--     estorno vira dedução de receita (2.09).
--
-- DECISÕES APLICADAS
--   D1 receita BRUTA + taxa como despesa financeira
--   D2 competência integral na data do pagamento da venda
--   D3 lançamento AGREGADO (não um por recebível) — ver `pagarme_project_ledger`
--   D4 corte em 01/09/2026 (o histórico anterior fica intacto)
--   D5 estorno/chargeback no período corrente
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contas novas no plano-mestre + propagação (mesmo caminho do `9.08`)
-- -----------------------------------------------------------------------------
insert into public.chart_of_accounts_master
  (organization_id, code, name, kind, dre_section, is_summary, below_the_line, sign_hint, sort_order)
select o.id, v.code, v.name, v.kind::public.account_kind, v.section::public.dre_section,
       false, false, v.sign, v.sort
from public.organizations o
cross join (values
  -- MDR: o custo real de receber por cartão. Hoje está embutido no líquido e
  -- portanto ausente da DRE.
  ('7.09', 'Taxas de Meio de Pagamento (MDR)',   'financial_expense', 'financial_result',    '-', 745),
  -- Antecipação: custo distinto do MDR, e só existe quando a data do recebível é
  -- puxada para frente. Separado para dar visibilidade à decisão de antecipar.
  ('7.10', 'Custo de Antecipação de Recebíveis', 'financial_expense', 'financial_result',    '-', 746),
  -- Estorno/chargeback deduzem receita (não são despesa): vão para o bloco de
  -- deduções, junto dos impostos sobre venda.
  ('2.09', '(-) Estornos e Chargebacks',         'revenue_deduction', 'revenue_deductions',  '-', 209)
) as v(code, name, kind, section, sign, sort)
on conflict (organization_id, code) do nothing;

select public.seed_company_chart_of_accounts(c.id)
from public.companies c
where c.is_holding = false;

-- -----------------------------------------------------------------------------
-- 2. Chave de projeção em `transactions`
--
-- A projeção precisa saber quais lançamentos ELA criou, para poder recalcular sem
-- duplicar e sem nunca tocar lançamento humano. Segue a convenção do repositório
-- (coluna dedicada, como `recurring_template_id` / `payroll_item_id`), mas como
-- chave determinística: a mesma entrada sempre gera a mesma chave.
--
-- Formato: pagarme:<company>:<kind>:<liquidação>:<competência>[:pending]
-- -----------------------------------------------------------------------------
alter table public.transactions
  add column if not exists pagarme_projection_key text;

comment on column public.transactions.pagarme_projection_key is
  'Chave determinística do lançamento gerado pela projeção do pagar.me. NULL = lançamento humano (a projeção nunca toca).';

create unique index if not exists uq_transactions_pagarme_projection
  on public.transactions(pagarme_projection_key)
  where pagarme_projection_key is not null;

-- -----------------------------------------------------------------------------
-- 3. pagarme_ledger_settings — para onde a projeção lança
--
-- Nada hardcoded: conta do gateway, banco de destino do saque e as contas do
-- plano são configuração por (conta pagar.me × empresa). Uma linha por empresa
-- RECEBEDORA, porque a RCO recebe dentro da conta da Jimmy e tem carteira e
-- plano de contas próprios.
-- -----------------------------------------------------------------------------
create table public.pagarme_ledger_settings (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete restrict,
  pagarme_account_id      uuid not null references public.pagarme_accounts(id) on delete cascade,
  company_id              uuid not null references public.companies(id) on delete cascade,

  -- carteira do gateway (bank_accounts.account_type = 'payment_gateway')
  gateway_bank_account_id uuid references public.bank_accounts(id) on delete set null,
  -- destino padrão do saque (conta bancária real)
  payout_bank_account_id  uuid references public.bank_accounts(id) on delete set null,

  -- contas do plano usadas pela projeção
  revenue_account_id      uuid references public.chart_of_accounts(id) on delete set null,
  fee_account_id          uuid references public.chart_of_accounts(id) on delete set null,
  anticipation_account_id uuid references public.chart_of_accounts(id) on delete set null,
  refund_account_id       uuid references public.chart_of_accounts(id) on delete set null,

  -- D4: a projeção ignora liquidação anterior a esta data (o histórico até o
  -- corte continua representado pelos lançamentos manuais existentes)
  cutover_date            date not null default '2026-09-01',
  -- kill-switch: desliga a projeção sem apagar configuração
  enabled                 boolean not null default false,

  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (pagarme_account_id, company_id)
);

create trigger trg_pagarme_ledger_settings_updated before update on public.pagarme_ledger_settings
  for each row execute function public.set_updated_at();

-- configuração que decide onde dinheiro é lançado: auditar
create trigger trg_audit_pagarme_ledger_settings
  after insert or update or delete on public.pagarme_ledger_settings
  for each row execute function public.audit_record();

alter table public.pagarme_ledger_settings enable row level security;

create policy pagarme_ledger_settings_sel on public.pagarme_ledger_settings
  for select to authenticated
  using (public.has_company_access(company_id) and public.can_view_module('sales'));

create policy pagarme_ledger_settings_ins on public.pagarme_ledger_settings
  for insert to authenticated
  with check (public.has_company_write_access(company_id));

create policy pagarme_ledger_settings_upd on public.pagarme_ledger_settings
  for update to authenticated
  using (public.has_company_write_access(company_id))
  with check (public.has_company_write_access(company_id));

create policy pagarme_ledger_settings_del on public.pagarme_ledger_settings
  for delete to authenticated
  using (public.has_company_write_access(company_id));

comment on table public.pagarme_ledger_settings is
  'Para onde a projeção do pagar.me lança: carteira do gateway, banco de saque, contas do plano, data de corte e kill-switch.';

-- -----------------------------------------------------------------------------
-- 4. pagarme_setup_gateway_account — cria a carteira e a config numa tacada
--
-- Chamada pela UI. Cria (idempotente) a conta `payment_gateway` da empresa e a
-- linha de settings resolvendo as contas do plano por CÓDIGO — assim a UI não
-- precisa conhecer uuid de conta contábil.
-- -----------------------------------------------------------------------------
create or replace function public.pagarme_setup_gateway_account(
  p_account_id uuid,
  p_company_id uuid,
  p_payout_bank_account_id uuid default null,
  p_cutover_date date default '2026-09-01'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_slug      text;
  v_gateway   uuid;
  v_nickname  text;
  v_settings  uuid;
begin
  select organization_id, slug into v_org, v_slug
  from public.pagarme_accounts where id = p_account_id and active = true;
  if v_org is null then
    raise exception 'conta pagar.me inexistente ou inativa' using errcode = 'no_data_found';
  end if;

  if not public.has_company_write_access(p_company_id) then
    raise exception 'sem permissão de escrita nesta empresa' using errcode = 'insufficient_privilege';
  end if;

  v_nickname := 'pagar.me — ' || v_slug;

  -- a carteira do gateway é uma conta como qualquer outra (aparece no extrato,
  -- entra no saldo), só não é um banco de verdade
  select id into v_gateway
  from public.bank_accounts
  where company_id = p_company_id and nickname = v_nickname;

  if v_gateway is null then
    insert into public.bank_accounts (
      company_id, bank_name, account_type, nickname, is_active, sort_order,
      initial_balance, initial_balance_date, notes
    ) values (
      p_company_id, 'pagar.me', 'payment_gateway', v_nickname, true, 900,
      0, p_cutover_date,
      'Carteira do gateway: recebe as liquidações, paga as taxas de adquirência e '
      || 'sai por transferência para a conta bancária. Criada por pagarme_setup_gateway_account.'
    )
    returning id into v_gateway;
  end if;

  insert into public.pagarme_ledger_settings (
    organization_id, pagarme_account_id, company_id,
    gateway_bank_account_id, payout_bank_account_id,
    revenue_account_id, fee_account_id, anticipation_account_id, refund_account_id,
    cutover_date, enabled
  )
  select
    v_org, p_account_id, p_company_id,
    v_gateway, p_payout_bank_account_id,
    (select id from public.chart_of_accounts where company_id = p_company_id and code = '1.01'),
    (select id from public.chart_of_accounts where company_id = p_company_id and code = '7.09'),
    (select id from public.chart_of_accounts where company_id = p_company_id and code = '7.10'),
    (select id from public.chart_of_accounts where company_id = p_company_id and code = '2.09'),
    p_cutover_date, false          -- nasce DESLIGADA: liga-se após conferir
  on conflict (pagarme_account_id, company_id) do update
    set gateway_bank_account_id = excluded.gateway_bank_account_id,
        payout_bank_account_id  = coalesce(excluded.payout_bank_account_id,
                                           public.pagarme_ledger_settings.payout_bank_account_id),
        updated_at = now()
  returning id into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.pagarme_setup_gateway_account(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.pagarme_setup_gateway_account(uuid, uuid, uuid, date) to authenticated;

-- =============================================================================
-- 5. pagarme_project_ledger — a projeção (o coração da fase)
--
-- Converte recebíveis em lançamentos. Reexecutável: recalcula a janela a partir
-- dos recebíveis vigentes e reconcilia o que já existe.
--
-- AGREGAÇÃO (D3). Chave:
--   (empresa, tipo de lançamento, data de liquidação, MÊS de competência, liquidado?)
--
-- Por que mês de competência e não a data exata da venda: um mesmo dia de
-- liquidação recebe parcelas de vendas de muitos dias distintos (parcela 1 de
-- novembro, parcela 2 de outubro, …). Agregar pela data exata devolveria ~10k
-- linhas/ano; pelo mês, ~500–750 — e o regime de competência continua exato,
-- porque a DRE bucketiza por mês. O `accrual_date` do lançamento é a ÚLTIMA data
-- de venda do grupo (data real, dentro do mês certo — nada inventado).
--
-- Por que "liquidado?" entra na chave: um grupo não pode misturar recebível pago
-- com pendente — o `status`/`cash_date` do lançamento seria ambíguo.
--
-- O que gera:
--   receita  inflow  em `revenue_account`  (BRUTO — D1)
--   taxa     outflow em `fee_account`      (MDR, na liquidação)
--   antecip. outflow em `anticipation_account`
--   estorno  outflow em `refund_account`   (dedução — D5)
-- Tudo na conta do gateway, que é onde o dinheiro de fato está.
-- =============================================================================
create or replace function public.pagarme_project_ledger(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  kind text,
  lancamentos int,
  valor numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.pagarme_ledger_settings%rowtype;
  v_from date;
begin
  if not public.has_company_write_access(p_company_id) then
    raise exception 'sem permissão de escrita nesta empresa' using errcode = 'insufficient_privilege';
  end if;

  -- Uma empresa pode receber por mais de uma conta pagar.me; a projeção roda por
  -- configuração habilitada. Na prática hoje é 1:1, então tratamos a primeira
  -- habilitada e deixamos as demais para chamadas subsequentes (a chave de
  -- projeção não colide entre contas porque inclui empresa+datas).
  select * into v_settings
  from public.pagarme_ledger_settings
  where company_id = p_company_id and enabled = true
  order by created_at
  limit 1;

  if v_settings.id is null then
    return; -- sem configuração habilitada -> no-op silencioso (kill-switch)
  end if;

  if v_settings.gateway_bank_account_id is null or v_settings.revenue_account_id is null then
    raise exception 'configuração incompleta: falta conta do gateway ou conta de receita'
      using errcode = 'no_data_found';
  end if;

  -- D4: nunca projeta antes do corte, para não duplicar o histórico manual
  v_from := greatest(p_from, v_settings.cutover_date);
  if v_from > p_to then
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- Grupos recalculados a partir dos recebíveis vigentes
  --
  -- `drop if exists` antes do create: `on commit drop` só limpa no COMMIT, então
  -- duas chamadas na mesma transação (ex.: projetar duas empresas em sequência)
  -- colidiriam no nome da temp table.
  -- ---------------------------------------------------------------------------
  drop table if exists _proj;

  create temp table _proj on commit drop as
  with recv as (
    select
      r.id,
      r.company_id,
      r.expected_payment_date                        as settle_on,
      date_trunc('month', r.sale_accrual_at)::date   as accrual_month,
      r.sale_accrual_at::date                        as accrual_date,
      r.status = 'paid'                              as is_settled,
      r.type,
      r.amount,
      r.fee,
      r.anticipation_fee,
      r.fraud_coverage_fee
    from public.pagarme_receivables r
    where r.company_id = p_company_id
      and r.pagarme_account_id = v_settings.pagarme_account_id
      and r.expected_payment_date between v_from and p_to
      -- sem data de competência não há como classificar o mês; fica de fora e
      -- aparece em v_pagarme_ledger_health
      and r.sale_accrual_at is not null
  )
  -- receita: só crédito (estorno tem tratamento próprio)
  select
    'revenue'::text as kind,
    settle_on,
    accrual_month,
    is_settled,
    max(accrual_date) as accrual_date,
    sum(amount)       as amount,
    array_agg(id)     as receivable_ids
  from recv
  where type = 'credit'
  group by settle_on, accrual_month, is_settled

  union all
  -- MDR: custo do recebimento, incorrido na liquidação (competência = caixa)
  select 'fee', settle_on, accrual_month, is_settled,
         max(accrual_date), sum(fee + fraud_coverage_fee), array_agg(id)
  from recv
  where type = 'credit' and (fee + fraud_coverage_fee) > 0
  group by settle_on, accrual_month, is_settled

  union all
  select 'anticipation', settle_on, accrual_month, is_settled,
         max(accrual_date), sum(anticipation_fee), array_agg(id)
  from recv
  where anticipation_fee > 0
  group by settle_on, accrual_month, is_settled

  union all
  -- D5: estorno/chargeback deduz no período em que aparece.
  -- `abs`: o payable de estorno pode chegar com valor negativo (a API varia), e o
  -- recebível preserva o sinal da origem. Aqui o que importa é a MAGNITUDE, já
  -- que o lançamento é uma saída — sem o abs, um estorno negativo cairia no
  -- filtro `amount > 0` e desapareceria em silêncio.
  select 'refund', settle_on, accrual_month, is_settled,
         max(accrual_date), sum(abs(amount)), array_agg(id)
  from recv
  where type in ('refund', 'chargeback')
  group by settle_on, accrual_month, is_settled;

  -- chave determinística + conta/direção por tipo
  alter table _proj add column proj_key text;
  alter table _proj add column account_id uuid;
  alter table _proj add column direction public.transaction_direction;

  -- Colunas qualificadas com `_proj.`: `kind` também é nome de coluna de saída da
  -- função (RETURNS TABLE), e sem a qualificação o PL/pgSQL não sabe qual é qual.
  update _proj set
    proj_key = 'pagarme:' || p_company_id::text || ':' || _proj.kind || ':' ||
               _proj.settle_on::text || ':' || to_char(_proj.accrual_month, 'YYYY-MM') ||
               case when _proj.is_settled then '' else ':pending' end,
    direction = (case when _proj.kind = 'revenue' then 'inflow' else 'outflow' end)
                  ::public.transaction_direction,
    account_id = case _proj.kind
      when 'revenue'      then v_settings.revenue_account_id
      when 'fee'          then coalesce(v_settings.fee_account_id, v_settings.revenue_account_id)
      when 'anticipation' then coalesce(v_settings.anticipation_account_id, v_settings.fee_account_id)
      when 'refund'       then coalesce(v_settings.refund_account_id, v_settings.revenue_account_id)
    end;

  -- ---------------------------------------------------------------------------
  -- Upsert dos lançamentos
  -- ---------------------------------------------------------------------------
  insert into public.transactions (
    company_id, account_id, bank_account_id, amount, direction, status,
    accrual_date, due_date, cash_date, description, pagarme_projection_key, metadata
  )
  select
    p_company_id,
    p.account_id,
    v_settings.gateway_bank_account_id,
    p.amount,
    p.direction,
    -- pendente = ainda não liquidou: é ISSO que faz o recebível aparecer no
    -- "A Receber" e no forecast (que somam pending/scheduled por due_date)
    case when p.is_settled then 'settled'::public.transaction_status
         else 'pending'::public.transaction_status end,
    p.accrual_date,
    p.settle_on,
    case when p.is_settled then p.settle_on end,
    case p.kind
      when 'revenue'      then 'Vendas pagar.me'
      when 'fee'          then 'Taxas pagar.me (MDR)'
      when 'anticipation' then 'Antecipação de recebíveis pagar.me'
      when 'refund'       then 'Estornos/chargebacks pagar.me'
    end
      || ' — competência ' || to_char(p.accrual_month, 'MM/YYYY')
      || ', liquidação ' || to_char(p.settle_on, 'DD/MM/YYYY'),
    p.proj_key,
    jsonb_build_object(
      'source', 'pagarme',
      'kind', p.kind,
      'settlementDate', p.settle_on,
      'accrualMonth', to_char(p.accrual_month, 'YYYY-MM'),
      'receivableCount', array_length(p.receivable_ids, 1),
      'pagarmeAccountId', v_settings.pagarme_account_id
    )
  from _proj p
  where p.amount > 0
  on conflict (pagarme_projection_key) where pagarme_projection_key is not null
  do update set
    amount      = excluded.amount,
    account_id  = excluded.account_id,
    status      = excluded.status,
    accrual_date= excluded.accrual_date,
    due_date    = excluded.due_date,
    cash_date   = excluded.cash_date,
    description = excluded.description,
    metadata    = excluded.metadata,
    updated_at  = now()
  -- lançamento já conciliado não é mexido: conciliação é ato humano e a
  -- divergência deve aparecer no relatório, não ser sobrescrita em silêncio
  where public.transactions.status <> 'reconciled';

  -- ---------------------------------------------------------------------------
  -- Amarra recebível -> lançamento (rastreabilidade e recompute)
  -- ---------------------------------------------------------------------------
  update public.pagarme_receivables r
  set transaction_id = t.id
  from _proj p
  join public.transactions t on t.pagarme_projection_key = p.proj_key
  where p.kind = 'revenue'
    and r.id = any (p.receivable_ids)
    and (r.transaction_id is distinct from t.id);

  -- ---------------------------------------------------------------------------
  -- Limpa grupos que deixaram de existir (ex.: recebível antecipado mudou de dia)
  -- Só remove o que a PRÓPRIA projeção criou, na janela, e que não foi conciliado.
  -- ---------------------------------------------------------------------------
  delete from public.transactions t
  where t.company_id = p_company_id
    and t.pagarme_projection_key is not null
    and t.due_date between v_from and p_to
    and t.status <> 'reconciled'
    and not exists (select 1 from _proj p where p.proj_key = t.pagarme_projection_key);

  return query
  select p.kind, count(*)::int, sum(p.amount)::numeric
  from _proj p
  where p.amount > 0
  group by p.kind
  order by p.kind;
end;
$$;

revoke all on function public.pagarme_project_ledger(uuid, date, date) from public, anon;
grant execute on function public.pagarme_project_ledger(uuid, date, date) to authenticated;

comment on function public.pagarme_project_ledger(uuid, date, date) is
  'Projeta os recebíveis do pagar.me em lançamentos agregados (empresa × tipo × liquidação × mês de competência). Idempotente; nunca toca lançamento humano nem conciliado.';
