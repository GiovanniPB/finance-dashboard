-- =============================================================================
-- NFS-e — Emissão retroativa em lote (backfill) · schema
-- Doc: docs/integrations/nfse-backfill-plan.md
--
-- O fluxo passivo só reage a charge.paid em tempo real. Este backfill lê
-- cobranças pagas históricas do pagar.me (GET /charges + GET /charges/{id}) e
-- cria os MESMOS invoice_jobs que o webhook criaria — a emissão continua sendo
-- feita pela esteira existente (drain/reconcile). Aqui vão:
--   1. o conserto da idempotência do caso SEM split (recipient NULL);
--   2. a tabela de controle dos runs (resumível por cursor de página).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Idempotência à prova de duplicata (linchpin)
--
-- O índice único (charge, recipient) tratava NULLs como distintos: cobrança SEM
-- split (recipient_id NULL) NÃO colidia consigo mesma, então backfill + webhook
-- (ou dois runs) poderiam criar 2 notas da empresa dona. No fluxo passivo isso
-- era mascarado pela dedup de sales_events(event_id) — que o backfill NÃO tem.
-- Postgres 15+ permite NULLS NOT DISTINCT: (ch_123, NULL) passa a colidir com
-- (ch_123, NULL). Assim (charge, recipient) vira a ÚNICA unidade de idempotência,
-- por onde webhook e todos os runs escrevem com upsert ignoreDuplicates.
--
-- Pré-condição: não podem existir duplicatas atuais de sem-split (senão a criação
-- do índice falha). Checagem manual antes do push (não há dados em nenhum ambiente
-- ainda, mas fica registrado):
--   select pagarme_charge_id, count(*) from public.invoice_jobs
--   where pagarme_recipient_id is null and pagarme_charge_id is not null
--   group by 1 having count(*) > 1;
-- -----------------------------------------------------------------------------
drop index if exists public.uq_invoice_jobs_charge_recipient;

create unique index uq_invoice_jobs_charge_recipient
  on public.invoice_jobs (pagarme_charge_id, pagarme_recipient_id)
  nulls not distinct;

-- -----------------------------------------------------------------------------
-- 2. invoice_backfill_runs — estado/controle de um lote retroativo
--
-- Um run é uma máquina de estado resumível: a Edge Function processa K páginas
-- por invocação (a partir de page_cursor) e o pg_cron a re-aciona até completar.
-- dry_run agrega um preview SEM inserir jobs (revisão antes de emitir).
-- -----------------------------------------------------------------------------
create type invoice_backfill_status as enum (
  'running',    -- em processamento (o cron drena)
  'completed',  -- todas as páginas processadas
  'failed',     -- erro terminal (após tentativas)
  'cancelled'   -- interrompido pelo operador
);

create table public.invoice_backfill_runs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete restrict,
  pagarme_account_id uuid not null references public.pagarme_accounts(id) on delete cascade,

  -- janela obrigatória (evita "emitir tudo" por acidente)
  created_since      timestamptz not null,
  created_until      timestamptz not null,

  -- controle de fila / retomada
  status             invoice_backfill_status not null default 'running',
  dry_run            boolean not null default true,
  page_cursor        int not null default 1,
  page_size          int not null default 100,

  -- contadores de progresso
  charges_seen       int not null default 0,
  jobs_created       int not null default 0,
  jobs_skipped       int not null default 0,

  -- preview agregado (dry-run): { porEmpresa, totalReais, pendingReview, ... }
  preview            jsonb,
  last_error         text,
  attempts           int not null default 0,

  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),

  constraint invoice_backfill_runs_window_ck check (created_until >= created_since)
);

create trigger trg_invoice_backfill_runs_updated before update on public.invoice_backfill_runs
  for each row execute function set_updated_at();

-- config sensível (dispara emissão de dinheiro em nota): auditar mudanças
create trigger trg_audit_invoice_backfill_runs
  after insert or update or delete on public.invoice_backfill_runs
  for each row execute function audit_record();

create index idx_backfill_runs_account on public.invoice_backfill_runs(pagarme_account_id);
-- o worker pega o run 'running' mais antigo (FOR UPDATE SKIP LOCKED)
create index idx_backfill_runs_running on public.invoice_backfill_runs(created_at)
  where status = 'running';

-- -----------------------------------------------------------------------------
-- RLS — escopada pela empresa dona da conta (super admin bypassa via helper),
-- mesma semântica de pagarme_accounts. Escrita das Edge Functions usa service
-- role (bypassa RLS).
-- -----------------------------------------------------------------------------
alter table public.invoice_backfill_runs enable row level security;

create policy "invoice_backfill_runs_scoped" on public.invoice_backfill_runs
  for all
  using (
    public.has_company_access(
      (select owner_company_id from public.pagarme_accounts a where a.id = pagarme_account_id)
    )
  )
  with check (
    public.has_company_access(
      (select owner_company_id from public.pagarme_accounts a where a.id = pagarme_account_id)
    )
  );
