-- =============================================================================
-- ⚠️ SUPERADO — este rascunho foi substituído pela migration real:
--    supabase/migrations/20260602144027_nfse_schema.sql
-- Diferenças da versão final: usa enums de domínio; fila baseada em STATUS na
-- invoice_jobs (sem pgmq). Mantido apenas como registro histórico do desenho.
-- =============================================================================
-- RASCUNHO — Schema NFS-e (Focus × pagar.me)
-- Projeto Supabase: vbeevkjenvgvnattzszt (Postgres 17, sa-east-1)
-- Convenções do repo: snake_case, uuid PK, RLS, audit_log, numeric(18,2)
-- =============================================================================

-- Extensão de fila (mensageria no Postgres)
create extension if not exists pgmq;

-- -----------------------------------------------------------------------------
-- 1. Config fiscal por empresa (1:1 com companies)
-- -----------------------------------------------------------------------------
create table public.fiscal_company_settings (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null unique references public.companies(id) on delete cascade,
  ambiente                    text not null default 'homologacao'
                                check (ambiente in ('homologacao','producao')),
  nfse_padrao                 text not null default 'municipal'
                                check (nfse_padrao in ('municipal','nacional')),
  emission_mode               text not null default 'manual'
                                check (emission_mode in ('manual','automatic')),
  enabled                     boolean not null default false,   -- kill-switch por empresa
  focus_token_ref             text,                             -- REFERÊNCIA ao segredo no Vault (nunca o token)
  inscricao_municipal         text,                             -- apenas números/letras (Barueri)
  municipio_ibge              text not null default '3505708',  -- Barueri
  item_lista_servico          text,                             -- LC116 padrão da empresa
  codigo_tributario_municipio text,
  aliquota_iss                numeric(5,4),                     -- ex: 0.0500 = 5%
  iss_retido                  boolean not null default false,
  optante_simples             boolean,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Mapa recebedor pagar.me -> empresa (ponte do split)
-- -----------------------------------------------------------------------------
create table public.pagarme_recipient_map (
  id                   uuid primary key default gen_random_uuid(),
  pagarme_recipient_id text not null unique,                    -- rp_... / re_...
  company_id           uuid not null references public.companies(id) on delete restrict,
  ambiente             text not null default 'homologacao'
                         check (ambiente in ('homologacao','producao')),
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Catálogo de serviços (classificação fiscal que o pagar.me não fornece)
-- -----------------------------------------------------------------------------
create table public.service_catalog (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references public.companies(id) on delete cascade,
  pagarme_plan_id             text,                             -- mapeia plano pagar.me (opcional)
  pagarme_item_code           text,                             -- ou code do item (opcional)
  descricao                   text not null,
  item_lista_servico          text not null,                    -- LC116
  codigo_tributario_municipio text,
  aliquota_iss                numeric(5,4),
  cnae                        text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. Ingest bruto de webhooks pagar.me (idempotente)
-- -----------------------------------------------------------------------------
create table public.sales_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'pagarme',
  event_id     text not null,                                   -- id do webhook (hook_...) p/ dedup
  event_type   text not null,                                   -- charge.paid, charge.refunded, ...
  resource_id  text,                                            -- ch_ / or_ / sub_
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

-- -----------------------------------------------------------------------------
-- 5. invoice_jobs — unidade de trabalho (uma NFS-e pretendida por recebedor)
-- -----------------------------------------------------------------------------
create table public.invoice_jobs (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id),
  company_id             uuid not null references public.companies(id),
  sales_event_id         uuid references public.sales_events(id),
  pagarme_charge_id      text,
  pagarme_recipient_id   text,

  -- ref enviada ao Focus: alfanumérica SEM hífen, única por token.
  -- sugestão: replace(gen_random_uuid()::text, '-', '')
  focus_ref              text not null unique,
  ambiente               text not null check (ambiente in ('homologacao','producao')),

  status                 text not null default 'pending_review' check (status in (
                            'pending_review','approved','queued','submitting',
                            'processing_authorization','authorized','rejected',
                            'cancelling','cancelled','failed'
                          )),

  -- valores (a fatia do split deste recebedor)
  valor_servicos         numeric(18,2) not null,

  -- snapshot mínimo do tomador (LGPD)
  tomador_documento      text,
  tomador_nome           text,
  tomador_email          text,
  tomador_endereco       jsonb,

  -- classificação fiscal resolvida no momento da criação
  item_lista_servico     text,
  codigo_tributario_municipio text,
  aliquota_iss           numeric(5,4),

  -- resultado Focus
  focus_status           text,
  chave_nfse             text,
  numero_nfse            text,
  xml_path               text,                                  -- Supabase Storage
  danfse_path            text,                                  -- Supabase Storage
  mensagem_sefaz         text,
  erros                  jsonb,
  attempts               int not null default 0,

  -- aprovação manual
  approved_by            uuid references auth.users(id),
  approved_at            timestamptz,

  -- write-back para o financeiro
  transaction_id         uuid references public.transactions(id),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index idx_invoice_jobs_status      on public.invoice_jobs (status);
create index idx_invoice_jobs_company     on public.invoice_jobs (company_id);
create index idx_invoice_jobs_charge      on public.invoice_jobs (pagarme_charge_id);

-- -----------------------------------------------------------------------------
-- 6. Ingest bruto de webhooks Focus (idempotente)
-- -----------------------------------------------------------------------------
create table public.focus_events (
  id           uuid primary key default gen_random_uuid(),
  focus_ref    text,                                            -- liga ao invoice_job
  status       text,
  payload      jsonb not null,
  dedup_key    text unique,                                     -- hash(ref + status + payload)
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

-- -----------------------------------------------------------------------------
-- 7. Fila de emissão
-- -----------------------------------------------------------------------------
select pgmq.create('nfse_emit');

-- =============================================================================
-- RLS (esqueleto — ajustar às funções existentes do projeto)
--   leitura: usuários com has_company_access(company_id)
--   escrita: somente service role (Edge Functions)
-- =============================================================================
alter table public.fiscal_company_settings enable row level security;
alter table public.pagarme_recipient_map   enable row level security;
alter table public.service_catalog         enable row level security;
alter table public.sales_events            enable row level security;
alter table public.invoice_jobs            enable row level security;
alter table public.focus_events            enable row level security;

-- Exemplo de policy de leitura (replicar o padrão do projeto):
-- create policy "read invoice_jobs by company access"
--   on public.invoice_jobs for select
--   using (public.has_company_access(company_id));

-- Escrita fica a cargo do service role das Edge Functions (bypassa RLS).
-- NÃO criar policy de insert/update/delete para usuários comuns.

-- =============================================================================
-- TODO ao aplicar de verdade:
--   - trigger updated_at (reusar o trigger genérico do projeto)
--   - trigger audit_log (reusar o trigger genérico existente)
--   - policies de leitura concretas com has_company_access / is_financial_user
--   - revisar on delete (restrict vs cascade) conforme política de retenção
-- =============================================================================
