-- =============================================================================
-- NFS-e (Focus NFe × pagar.me) — schema base
-- Doc: docs/integrations/nfse-pagarme-architecture.md
--
-- Regra central: 1 charge.paid (pagar.me, com split) -> N invoice_jobs
-- (uma NFS-e por empresa-recebedor do split). Fila baseada em status na
-- própria invoice_jobs (sem pgmq): linhas 'queued' são o trabalho a fazer.
-- Escrita pelas Edge Functions usa service role (bypassa RLS); usuários do
-- dashboard leem/operam via has_company_access.
-- =============================================================================

-- enums de domínio (consistente com o estilo do projeto)
create type nfse_ambiente as enum ('homologacao', 'producao');
create type nfse_padrao as enum ('municipal', 'nacional');
create type nfse_emission_mode as enum ('manual', 'automatic');
create type invoice_job_status as enum (
  'pending_review',           -- modo manual: aguarda aprovação no dashboard
  'approved',                 -- aprovado, prestes a entrar na fila
  'queued',                   -- na fila para emissão (a "fila")
  'submitting',               -- worker enviando ao Focus
  'processing_authorization', -- Focus aceitou (202), aguardando SEFAZ/prefeitura
  'authorized',              -- autorizado
  'rejected',                -- erro_autorizacao (ver mensagem_sefaz)
  'cancelling',
  'cancelled',
  'failed'                    -- falha terminal (após tentativas) / DLQ
);

-- -----------------------------------------------------------------------------
-- 1. fiscal_company_settings (1:1 com companies)
-- -----------------------------------------------------------------------------
create table public.fiscal_company_settings (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null unique references public.companies(id) on delete cascade,
  ambiente                    nfse_ambiente not null default 'homologacao',
  nfse_padrao                 nfse_padrao not null default 'municipal',
  emission_mode               nfse_emission_mode not null default 'manual',
  enabled                     boolean not null default false,        -- kill-switch por empresa
  focus_token_ref             text,                                  -- REFERÊNCIA ao segredo no Vault (nunca o token)
  inscricao_municipal         text,                                  -- apenas números/letras (Barueri)
  municipio_ibge              text not null default '3505708',       -- Barueri
  item_lista_servico          text,                                  -- LC116 padrão
  codigo_tributario_municipio text,
  aliquota_iss                numeric(5, 4),                         -- ex.: 0.0500 = 5%
  iss_retido                  boolean not null default false,
  optante_simples             boolean,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references auth.users(id)
);
create trigger trg_fiscal_settings_updated before update on public.fiscal_company_settings
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. pagarme_recipient_map (ponte do split: recebedor pagar.me -> empresa)
-- -----------------------------------------------------------------------------
create table public.pagarme_recipient_map (
  id                   uuid primary key default gen_random_uuid(),
  pagarme_recipient_id text not null unique,                         -- rp_... / re_...
  company_id           uuid not null references public.companies(id) on delete restrict,
  ambiente             nfse_ambiente not null default 'homologacao',
  active               boolean not null default true,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id)
);
create trigger trg_recipient_map_updated before update on public.pagarme_recipient_map
  for each row execute function set_updated_at();
create index idx_recipient_map_company on public.pagarme_recipient_map(company_id);

-- -----------------------------------------------------------------------------
-- 3. service_catalog (classificação fiscal que o pagar.me não fornece)
-- -----------------------------------------------------------------------------
create table public.service_catalog (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references public.companies(id) on delete cascade,
  pagarme_plan_id             text,                                  -- mapeia plano pagar.me (opcional)
  pagarme_item_code           text,                                  -- ou code do item (opcional)
  descricao                   text not null,
  item_lista_servico          text not null,                        -- LC116
  codigo_tributario_municipio text,
  aliquota_iss                numeric(5, 4),
  cnae                        text,
  active                      boolean not null default true,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references auth.users(id)
);
create trigger trg_service_catalog_updated before update on public.service_catalog
  for each row execute function set_updated_at();
create index idx_service_catalog_company on public.service_catalog(company_id);
create index idx_service_catalog_plan on public.service_catalog(pagarme_plan_id) where pagarme_plan_id is not null;

-- -----------------------------------------------------------------------------
-- 4. sales_events (ingest bruto de webhooks pagar.me, idempotente)
-- -----------------------------------------------------------------------------
create table public.sales_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'pagarme',
  event_id      text not null,                                      -- id do webhook (hook_...) p/ dedup
  event_type    text not null,                                      -- charge.paid, charge.refunded, ...
  resource_id   text,                                               -- ch_ / or_ / sub_
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  process_error text,
  unique (provider, event_id)
);
create index idx_sales_events_unprocessed on public.sales_events(received_at) where processed_at is null;
create index idx_sales_events_resource on public.sales_events(resource_id) where resource_id is not null;

-- -----------------------------------------------------------------------------
-- 5. invoice_jobs (unidade de trabalho = uma NFS-e pretendida por recebedor)
-- -----------------------------------------------------------------------------
create table public.invoice_jobs (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete restrict,
  company_id                  uuid not null references public.companies(id) on delete restrict,
  sales_event_id              uuid references public.sales_events(id) on delete set null,
  pagarme_charge_id           text,
  pagarme_recipient_id        text,

  -- ref enviada ao Focus: alfanumérica SEM hífen, única por token
  focus_ref                   text not null unique default replace(gen_random_uuid()::text, '-', ''),
  ambiente                    nfse_ambiente not null default 'homologacao',
  status                      invoice_job_status not null default 'pending_review',

  -- valor (a fatia do split deste recebedor)
  valor_servicos              numeric(18, 2) not null check (valor_servicos > 0),

  -- snapshot mínimo do tomador (LGPD)
  tomador_documento           text,
  tomador_nome                text,
  tomador_email               text,
  tomador_endereco            jsonb,

  -- classificação fiscal resolvida na criação do job
  item_lista_servico          text,
  codigo_tributario_municipio text,
  aliquota_iss                numeric(5, 4),

  -- resultado Focus
  focus_status                text,
  chave_nfse                  text,
  numero_nfse                 text,
  xml_path                    text,                                 -- Supabase Storage
  danfse_path                 text,                                 -- Supabase Storage
  mensagem_sefaz              text,
  erros                       jsonb,

  -- controle de fila / retry
  attempts                    int not null default 0,
  next_attempt_at             timestamptz,
  last_attempt_at             timestamptz,

  -- aprovação manual
  approved_by                 uuid references auth.users(id),
  approved_at                 timestamptz,

  -- write-back para o financeiro
  transaction_id              uuid references public.transactions(id) on delete set null,

  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create trigger trg_invoice_jobs_updated before update on public.invoice_jobs
  for each row execute function set_updated_at();

create index idx_invoice_jobs_company on public.invoice_jobs(company_id);
create index idx_invoice_jobs_status on public.invoice_jobs(status);
create index idx_invoice_jobs_charge on public.invoice_jobs(pagarme_charge_id) where pagarme_charge_id is not null;
create index idx_invoice_jobs_sales_event on public.invoice_jobs(sales_event_id) where sales_event_id is not null;
-- fila: linhas prontas para o worker reivindicar (FOR UPDATE SKIP LOCKED)
create index idx_invoice_jobs_queue on public.invoice_jobs(next_attempt_at)
  where status in ('queued', 'submitting', 'processing_authorization');
-- evita duplicar nota do mesmo recebedor para a mesma cobrança
create unique index uq_invoice_jobs_charge_recipient
  on public.invoice_jobs(pagarme_charge_id, pagarme_recipient_id)
  where pagarme_charge_id is not null and pagarme_recipient_id is not null;

create trigger trg_audit_invoice_jobs
  after insert or update or delete on public.invoice_jobs
  for each row execute function audit_record();

-- -----------------------------------------------------------------------------
-- 6. focus_events (ingest bruto de webhooks Focus, idempotente)
-- -----------------------------------------------------------------------------
create table public.focus_events (
  id            uuid primary key default gen_random_uuid(),
  focus_ref     text,                                               -- liga ao invoice_job
  status        text,
  payload       jsonb not null,
  dedup_key     text not null unique,                               -- hash(ref + status + payload)
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  process_error text
);
create index idx_focus_events_ref on public.focus_events(focus_ref) where focus_ref is not null;
create index idx_focus_events_unprocessed on public.focus_events(received_at) where processed_at is null;

-- =============================================================================
-- RLS
--   leitura/operação no dashboard: usuários com has_company_access(company_id)
--   ingest bruto (sales_events/focus_events): apenas super_admin lê (payloads
--   podem conter PII); escrita das Edge Functions usa service role (bypassa RLS)
-- =============================================================================
alter table public.fiscal_company_settings enable row level security;
alter table public.pagarme_recipient_map   enable row level security;
alter table public.service_catalog         enable row level security;
alter table public.invoice_jobs            enable row level security;
alter table public.sales_events            enable row level security;
alter table public.focus_events            enable row level security;

-- tabelas company-scoped: mesma semântica das demais do projeto
create policy "fiscal_company_settings_scoped" on public.fiscal_company_settings
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

create policy "pagarme_recipient_map_scoped" on public.pagarme_recipient_map
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

create policy "service_catalog_scoped" on public.service_catalog
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

create policy "invoice_jobs_scoped" on public.invoice_jobs
  for all
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

-- ingest bruto: somente super_admin (service role das Edge Functions bypassa RLS)
create policy "sales_events_super_admin" on public.sales_events
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "focus_events_super_admin" on public.focus_events
  for all using (public.is_super_admin()) with check (public.is_super_admin());
