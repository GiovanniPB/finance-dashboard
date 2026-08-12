-- =============================================================================
-- pagar.me — Ledger de vendas (2/2): tabelas
-- Doc: docs/integrations/pagarme-sales-plan.md
-- Contrato da API validado em produção: docs/integrations/pagarme-api-contract.md
--
-- O QUE ESTE LEDGER É: um ESPELHO do pagar.me. Ele é reconstruível a partir da
-- API e nunca é editado à mão. O financeiro (`transactions`) é uma PROJEÇÃO dele
-- — nunca o contrário. Isso é o que permite re-sincronizar sem perder ajuste
-- manual e sem duplicar receita.
--
-- POR QUE NÃO REUSAR `invoice_jobs`: fiscal ≠ financeiro. Uma cobrança pode não
-- gerar nota (empresa sem config fiscal) e uma nota pode ser rejeitada enquanto o
-- dinheiro entra normalmente. Além disso `invoice_jobs` é 1 linha por
-- (cobrança × recebedor); recebível é 1 linha por (cobrança × recebedor × PARCELA).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pagarme_customers — o comprador, por conta pagar.me
--
-- PII (nome/e-mail/documento): guardamos o mínimo para análise de venda
-- (novos vs. recorrentes, coorte, LTV). O escopo de leitura é a empresa DONA da
-- conta, não as empresas recebedoras do split — ver nota de RLS no fim.
-- -----------------------------------------------------------------------------
create table public.pagarme_customers (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  pagarme_account_id  uuid not null references public.pagarme_accounts(id) on delete cascade,
  pagarme_customer_id text not null,                 -- cus_…

  name                text,
  email               text,
  document            text,
  document_type       text,                          -- CPF | CNPJ | PASSPORT
  first_purchase_at   timestamptz,

  last_synced_at      timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (pagarme_account_id, pagarme_customer_id)
);

create trigger trg_pagarme_customers_updated before update on public.pagarme_customers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. pagarme_subscriptions — assinatura (base de MRR/churn)
--
-- ATENÇÃO (medido na Fase 0): só a conta da Jimmy usa assinatura (156 de 182
-- eventos). A conta da RCO não tem NENHUMA — vende contrato anual como pedido
-- avulso parcelado em 12x. Conta sem assinatura é caso NORMAL, não erro; e não
-- existe uma definição única de MRR/churn para o grupo.
-- -----------------------------------------------------------------------------
create table public.pagarme_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete restrict,
  pagarme_account_id      uuid not null references public.pagarme_accounts(id) on delete cascade,
  pagarme_subscription_id text not null,             -- sub_…
  pagarme_customer_id     text,                      -- cus_…
  pagarme_plan_id         text,                      -- plan_…
  plan_name               text,

  status                  text,                      -- active|canceled|future|expired|trialing
  interval                text,                      -- day|week|month|year
  interval_count          integer,
  billing_type            text,                      -- prepaid|postpaid|exact_day
  payment_method          text,

  start_at                timestamptz,
  next_billing_at         timestamptz,
  canceled_at             timestamptz,
  current_cycle_start     timestamptz,
  current_cycle_end       timestamptz,

  -- receita normalizada por mês, derivada de (valor do ciclo ÷ meses do ciclo)
  mrr                     numeric(18,2),

  last_synced_at          timestamptz,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (pagarme_account_id, pagarme_subscription_id)
);

create trigger trg_pagarme_subscriptions_updated before update on public.pagarme_subscriptions
  for each row execute function public.set_updated_at();

create index idx_pagarme_subs_status on public.pagarme_subscriptions(pagarme_account_id, status);
create index idx_pagarme_subs_customer on public.pagarme_subscriptions(pagarme_account_id, pagarme_customer_id);
create index idx_pagarme_subs_canceled on public.pagarme_subscriptions(canceled_at)
  where canceled_at is not null;

-- -----------------------------------------------------------------------------
-- 3. pagarme_charges — a VENDA
--
-- `amount` é o BRUTO da cobrança (é sobre ele que a NFS-e é emitida). O rateio
-- entre empresas não vive aqui — vive nos recebíveis, porque é o recebedor do
-- payable que determina de quem é o dinheiro.
-- -----------------------------------------------------------------------------
create table public.pagarme_charges (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete restrict,
  pagarme_account_id      uuid not null references public.pagarme_accounts(id) on delete cascade,
  pagarme_charge_id       text not null,             -- ch_…

  pagarme_order_id        text,                      -- or_…  (venda avulsa)
  pagarme_invoice_id      text,                      -- in_…  (ciclo de assinatura)
  pagarme_subscription_id text,                      -- sub_…
  pagarme_plan_id         text,                      -- plan_…
  pagarme_customer_id     text,                      -- cus_…

  status                  text not null,             -- paid|failed|refunded|chargedback|…
  payment_method          text,                      -- credit_card|pix|boleto|…
  installments            integer,
  amount                  numeric(18,2) not null,    -- BRUTO
  paid_amount             numeric(18,2),
  refunded_amount         numeric(18,2) not null default 0,
  currency                text not null default 'BRL',

  charge_created_at       timestamptz,               -- a compra
  paid_at                 timestamptz,               -- o pagamento (competência da venda)

  card_brand              text,
  card_last_four          text,
  acquirer_name           text,
  recurrence_cycle        text,                      -- first|subsequent

  sales_event_id          uuid references public.sales_events(id) on delete set null,
  last_synced_at          timestamptz,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (pagarme_account_id, pagarme_charge_id)
);

create trigger trg_pagarme_charges_updated before update on public.pagarme_charges
  for each row execute function public.set_updated_at();

-- consultas do dashboard: série temporal, funil por status, coorte de cliente
create index idx_pagarme_charges_paid on public.pagarme_charges(pagarme_account_id, paid_at)
  where status = 'paid';
create index idx_pagarme_charges_status on public.pagarme_charges(pagarme_account_id, status, charge_created_at);
create index idx_pagarme_charges_customer on public.pagarme_charges(pagarme_account_id, pagarme_customer_id);
create index idx_pagarme_charges_subscription on public.pagarme_charges(pagarme_subscription_id)
  where pagarme_subscription_id is not null;

-- -----------------------------------------------------------------------------
-- 4. pagarme_receivables — O CRONOGRAMA (o coração deste projeto)
--
-- Uma linha por payable: (cobrança × recebedor × parcela). É aqui que mora o
-- "a receber" que hoje não existe no sistema — R$ 2,5 milhões contratados, com
-- data de liquidação conhecida desde o momento da venda.
--
-- `company_id` VEM DO RECEBEDOR do payable (via pagarme_recipient_map), não do
-- dono da conta: é assim que a RCO — que é recebedora DENTRO da conta da Jimmy —
-- recebe o AR correto.
--
-- Sem FK para `pagarme_charges`: o payable é auto-suficiente para a projeção
-- (traz `accrual_at`, a data da venda), então um recebível que chegue antes da
-- cobrança ainda é dinheiro válido. Preferimos ingerir e reportar o órfão em
-- `v_pagarme_ledger_health` a fazer o sync falhar por ordem de chegada.
-- -----------------------------------------------------------------------------
create table public.pagarme_receivables (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations(id) on delete restrict,
  pagarme_account_id         uuid not null references public.pagarme_accounts(id) on delete cascade,
  pagarme_payable_id         text not null,          -- number em /payables, string em /balance/operations
  pagarme_charge_id          text,                   -- ch_…
  pagarme_recipient_id       text,                   -- re_… / rp_…
  company_id                 uuid not null references public.companies(id) on delete restrict,

  -- conjuntos ABERTOS de propósito (a API pode ganhar valores novos): sem CHECK,
  -- o parser é que classifica crédito × débito.
  type                       text not null,          -- credit|refund|chargeback|…
  status                     text not null,          -- waiting_funds|paid|suspended|…
  installment                integer,

  amount                     numeric(18,2) not null, -- BRUTO da parcela p/ este recebedor
  fee                        numeric(18,2) not null default 0,
  anticipation_fee           numeric(18,2) not null default 0,
  fraud_coverage_fee         numeric(18,2) not null default 0,
  net_amount                 numeric(18,2) generated always as
                               (amount - fee - anticipation_fee - fraud_coverage_fee) stored,

  -- data corrente informada pela API (muda se o recebível for antecipado)
  expected_payment_date      date,
  -- valor da PRIMEIRA sincronização; imutável (trigger abaixo).
  -- A API não devolve `original_payment_date`, então é a comparação entre estes
  -- dois campos + anticipation_fee > 0 que revela antecipação.
  first_seen_payment_date    date,
  -- competência da venda no pagar.me (`accrual_at` do payable)
  sale_accrual_at            timestamptz,
  -- não existe campo de data efetiva: quando liquida, a própria expected vale
  settled_on                 date generated always as
                               (case when status = 'paid' then expected_payment_date end) stored,

  liquidation_arrangement_id text,                   -- la_… só quando liquidado
  split_id                   text,                   -- sr_… só via /balance/operations
  gateway_id                 text,
  payment_method             text,

  -- write-back: aponta para a linha AGREGADA em transactions (N recebíveis → 1)
  transaction_id             uuid references public.transactions(id) on delete set null,

  last_synced_at             timestamptz,
  metadata                   jsonb not null default '{}'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  unique (pagarme_account_id, pagarme_payable_id)
);

create trigger trg_pagarme_receivables_updated before update on public.pagarme_receivables
  for each row execute function public.set_updated_at();

-- `first_seen_payment_date` é a memória do cronograma original. Precisa ser
-- imposta no banco (e não só no upsert) porque webhook, sweep de maturidade e
-- backfill escrevem na mesma linha por caminhos diferentes.
create or replace function public.pagarme_freeze_first_seen_payment_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.first_seen_payment_date :=
      coalesce(new.first_seen_payment_date, new.expected_payment_date);
  else
    new.first_seen_payment_date :=
      coalesce(old.first_seen_payment_date, new.expected_payment_date);
  end if;
  return new;
end;
$$;

create trigger trg_pagarme_receivables_freeze_first_seen
  before insert or update on public.pagarme_receivables
  for each row execute function public.pagarme_freeze_first_seen_payment_date();

-- A CONSULTA CENTRAL: o "a receber" por empresa e data de liquidação.
create index idx_pagarme_recv_waiting
  on public.pagarme_receivables(company_id, expected_payment_date)
  where status = 'waiting_funds';
-- realização (o que liquidou num período) e a projeção contábil
create index idx_pagarme_recv_settled
  on public.pagarme_receivables(company_id, settled_on)
  where status = 'paid';
create index idx_pagarme_recv_charge
  on public.pagarme_receivables(pagarme_account_id, pagarme_charge_id);
create index idx_pagarme_recv_recipient
  on public.pagarme_receivables(pagarme_account_id, pagarme_recipient_id);
-- sweep de maturidade: recebíveis vencendo que ainda não liquidaram
create index idx_pagarme_recv_maturity
  on public.pagarme_receivables(expected_payment_date)
  where status = 'waiting_funds';
-- recompute idempotente da projeção
create index idx_pagarme_recv_transaction
  on public.pagarme_receivables(transaction_id)
  where transaction_id is not null;

-- -----------------------------------------------------------------------------
-- 5. pagarme_payouts — o saque que cai no banco
--
-- NÃO vem da API: `GET /transfers` responde 401 (allowlist de IP no pagar.me, e
-- o egresso do Edge Runtime não é fixo) e os endpoints por recebedor vêm vazios.
-- Nasce da CONCILIAÇÃO: a TED está no extrato bancário, que já entra pelo
-- import/reconciliation existente. Daqui sai a perna de `create_transfer`
-- (gateway → banco real), que mantém o saque fora da DRE/fluxo.
-- -----------------------------------------------------------------------------
create table public.pagarme_payouts (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  pagarme_account_id   uuid not null references public.pagarme_accounts(id) on delete cascade,
  pagarme_recipient_id text,
  company_id           uuid not null references public.companies(id) on delete restrict,

  -- identificador da origem (id do saque no pagar.me quando conhecido, senão a
  -- referência da linha do extrato) — a chave de idempotência da conciliação
  external_ref         text not null,
  amount               numeric(18,2) not null check (amount > 0),
  status               text not null default 'reconciled',
  funded_on            date not null,

  bank_account_id      uuid references public.bank_accounts(id) on delete set null,
  statement_line_id    uuid references public.bank_statement_lines(id) on delete set null,
  -- as duas pernas da transferência gerada
  transfer_group_id    uuid,

  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id),

  unique (pagarme_account_id, external_ref)
);

create trigger trg_pagarme_payouts_updated before update on public.pagarme_payouts
  for each row execute function public.set_updated_at();

-- Saque move dinheiro entre contas e é criado por AÇÃO HUMANA (conciliação):
-- auditamos. Os espelhos (charges/receivables) não são auditados de propósito —
-- são reescritos a cada sync e inflariam o audit_log sem informação nova; a
-- trilha que importa está em `transactions`, que já é auditada.
create trigger trg_audit_pagarme_payouts
  after insert or update or delete on public.pagarme_payouts
  for each row execute function public.audit_record();

create index idx_pagarme_payouts_company on public.pagarme_payouts(company_id, funded_on);
create index idx_pagarme_payouts_transfer on public.pagarme_payouts(transfer_group_id)
  where transfer_group_id is not null;

-- -----------------------------------------------------------------------------
-- 6. pagarme_sync_runs — controle dos lotes de sincronização
--
-- Mesma máquina de estado resumível de `invoice_backfill_runs`: a Edge Function
-- processa K páginas por invocação a partir de `page_cursor` e o pg_cron a
-- re-aciona até completar. Generalizado por `resource`.
-- -----------------------------------------------------------------------------
create type public.pagarme_sync_resource as enum (
  'charges',            -- enumera + hidrata cobranças (backfill histórico)
  'payables',           -- sweep de maturidade por cobrança
  'balance_operations', -- realização das liquidações (via primária)
  'subscriptions'       -- assinaturas (MRR/churn)
);

create table public.pagarme_sync_runs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete restrict,
  pagarme_account_id uuid not null references public.pagarme_accounts(id) on delete cascade,
  resource           public.pagarme_sync_resource not null,

  -- janela obrigatória: evita "sincronizar tudo" por acidente
  window_start       timestamptz not null,
  window_end         timestamptz not null,

  status             public.invoice_backfill_status not null default 'running',
  dry_run            boolean not null default false,
  page_cursor        int not null default 1,
  page_size          int not null default 30,        -- /charges capa em 30

  items_seen         int not null default 0,
  items_written      int not null default 0,
  items_skipped      int not null default 0,

  preview            jsonb,
  last_error         text,
  attempts           int not null default 0,

  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),

  constraint pagarme_sync_runs_window_ck check (window_end >= window_start)
);

create trigger trg_pagarme_sync_runs_updated before update on public.pagarme_sync_runs
  for each row execute function public.set_updated_at();

create index idx_pagarme_sync_account on public.pagarme_sync_runs(pagarme_account_id, resource);
-- o worker pega o run 'running' mais antigo (FOR UPDATE SKIP LOCKED)
create index idx_pagarme_sync_running on public.pagarme_sync_runs(created_at)
  where status = 'running';

-- =============================================================================
-- RLS — módulo 'sales', padrão do modelo de permissões vigente:
--   SELECT  = escopo da empresa AND can_view_module('sales')
--   ESCRITA = has_company_write_access  (admin/editor; viewer nunca)
-- Escrita das Edge Functions usa service role (bypassa RLS).
--
-- DOIS ESCOPOS DIFERENTES, de propósito:
--
--  a) `pagarme_receivables` / `pagarme_payouts` têm `company_id` próprio → o
--     escopo é a empresa QUE RECEBE o dinheiro. É o que faz um usuário só-RCO
--     ver os recebíveis da RCO gerados dentro da conta da Jimmy.
--
--  b) `pagarme_customers` / `pagarme_subscriptions` / `pagarme_charges` /
--     `pagarme_sync_runs` são escopados pela empresa DONA da conta. É dado
--     comercial do vendedor (inclui PII do comprador dele): um usuário só-RCO vê
--     o quanto a RCO recebe, sem enxergar a base de clientes da Jimmy. Super
--     admin continua vendo tudo.
-- =============================================================================

alter table public.pagarme_customers      enable row level security;
alter table public.pagarme_subscriptions  enable row level security;
alter table public.pagarme_charges        enable row level security;
alter table public.pagarme_receivables    enable row level security;
alter table public.pagarme_payouts        enable row level security;
alter table public.pagarme_sync_runs      enable row level security;

-- (a) tabelas com company_id próprio
do $$
declare t text;
begin
  for t in select unnest(array['pagarme_receivables', 'pagarme_payouts']) loop
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (public.has_company_access(company_id) and public.can_view_module('sales'))
    $f$, t || '_sel', t);

    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (public.has_company_write_access(company_id))
    $f$, t || '_ins', t);

    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (public.has_company_write_access(company_id))
      with check (public.has_company_write_access(company_id))
    $f$, t || '_upd', t);

    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (public.has_company_write_access(company_id))
    $f$, t || '_del', t);
  end loop;
end $$;

-- (b) tabelas escopadas pela empresa dona da conta
do $$
declare
  t text;
  owner_expr text := '(select a.owner_company_id from public.pagarme_accounts a where a.id = pagarme_account_id)';
begin
  for t in select unnest(array[
    'pagarme_customers', 'pagarme_subscriptions', 'pagarme_charges', 'pagarme_sync_runs'
  ]) loop
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (public.has_company_access(%s) and public.can_view_module('sales'))
    $f$, t || '_sel', t, owner_expr);

    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (public.has_company_write_access(%s))
    $f$, t || '_ins', t, owner_expr);

    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (public.has_company_write_access(%s))
      with check (public.has_company_write_access(%s))
    $f$, t || '_upd', t, owner_expr, owner_expr);

    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (public.has_company_write_access(%s))
    $f$, t || '_del', t, owner_expr);
  end loop;
end $$;

-- =============================================================================
-- Comentários de tabela (aparecem no Studio e nos tipos gerados)
-- =============================================================================
comment on table public.pagarme_customers is
  'Espelho dos compradores do pagar.me, por conta. PII mínima para análise de venda.';
comment on table public.pagarme_subscriptions is
  'Espelho das assinaturas. Só a conta da Jimmy usa assinatura; a da RCO vende pedido parcelado.';
comment on table public.pagarme_charges is
  'Espelho das vendas (cobranças). amount = BRUTO; o rateio entre empresas fica em pagarme_receivables.';
comment on table public.pagarme_receivables is
  'Cronograma de recebíveis: 1 linha por cobrança × recebedor × parcela. Fonte do "a receber" do pagar.me.';
comment on table public.pagarme_payouts is
  'Saque do gateway para o banco. Nasce da conciliação do extrato (a API de transfers é bloqueada por IP).';
comment on table public.pagarme_sync_runs is
  'Controle resumível dos lotes de sincronização com a API do pagar.me.';

comment on column public.pagarme_receivables.company_id is
  'Empresa que RECEBE — resolvida pelo recebedor do payable, não pelo dono da conta.';
comment on column public.pagarme_receivables.first_seen_payment_date is
  'Data de liquidação vista na primeira sincronização; imutável. Divergir de expected_payment_date indica antecipação.';
comment on column public.pagarme_receivables.transaction_id is
  'Linha AGREGADA em transactions que projeta este recebível (N recebíveis → 1 lançamento).';
