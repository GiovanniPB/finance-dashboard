-- =============================================================================
-- NFS-e — multi-conta pagar.me
-- Doc: docs/integrations/nfse-pagarme-architecture.md
--
-- O grupo opera N contas pagar.me distintas (ex.: RCO e Jimmy). Uma empresa
-- pode ser recebedora (split) DENTRO da conta de outra e, ao mesmo tempo, ter
-- conta própria. Cada conta:
--   - tem uma empresa "dona" (owner_company_id) — fallback para cobranças
--     SEM split (a nota é da própria dona);
--   - tem segredo de webhook próprio no Vault (webhook_secret_ref);
--   - é endereçada pelo slug na URL do webhook (?account=<slug>).
--
-- Tabelas NFS-e ainda estão vazias (local e remoto), então adicionar colunas
-- NOT NULL e trocar a unicidade do recebedor é seguro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- pagarme_accounts (uma por conexão pagar.me)
-- -----------------------------------------------------------------------------
create table public.pagarme_accounts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete restrict,
  slug               text not null unique,                          -- usado na URL ?account=<slug>
  label              text not null,                                 -- "RCO Tecnologia", "Jimmy Carvalho"
  owner_company_id   uuid not null references public.companies(id) on delete restrict, -- dona; fallback p/ cobrança sem split
  webhook_secret_ref text,                                          -- REFERÊNCIA ao segredo no Vault (nunca o segredo)
  ambiente           nfse_ambiente not null default 'homologacao',
  active             boolean not null default true,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id)
);
create trigger trg_pagarme_accounts_updated before update on public.pagarme_accounts
  for each row execute function set_updated_at();
create index idx_pagarme_accounts_org on public.pagarme_accounts(organization_id);
create index idx_pagarme_accounts_owner on public.pagarme_accounts(owner_company_id);

-- conexões são config sensível (roteamento de dinheiro): auditar mudanças
create trigger trg_audit_pagarme_accounts
  after insert or update or delete on public.pagarme_accounts
  for each row execute function audit_record();

-- -----------------------------------------------------------------------------
-- vincular recebedores à conta de origem
--   o mesmo recebedor pode existir em contas distintas -> unicidade por conta
-- -----------------------------------------------------------------------------
alter table public.pagarme_recipient_map
  add column pagarme_account_id uuid not null references public.pagarme_accounts(id) on delete cascade;

alter table public.pagarme_recipient_map
  drop constraint pagarme_recipient_map_pagarme_recipient_id_key;

create unique index uq_recipient_map_account_recipient
  on public.pagarme_recipient_map(pagarme_account_id, pagarme_recipient_id);
create index idx_recipient_map_account on public.pagarme_recipient_map(pagarme_account_id);

-- -----------------------------------------------------------------------------
-- carimbar a conta de origem no ingest e no job (procedência + filtro na UI)
-- -----------------------------------------------------------------------------
alter table public.sales_events
  add column pagarme_account_id uuid references public.pagarme_accounts(id) on delete set null;
create index idx_sales_events_account on public.sales_events(pagarme_account_id)
  where pagarme_account_id is not null;

alter table public.invoice_jobs
  add column pagarme_account_id uuid references public.pagarme_accounts(id) on delete set null;
create index idx_invoice_jobs_account on public.invoice_jobs(pagarme_account_id)
  where pagarme_account_id is not null;

-- =============================================================================
-- RLS — conexões escopadas pela empresa dona (super admin bypassa via helper)
-- =============================================================================
alter table public.pagarme_accounts enable row level security;
create policy "pagarme_accounts_scoped" on public.pagarme_accounts
  for all
  using (public.has_company_access(owner_company_id))
  with check (public.has_company_access(owner_company_id));

-- =============================================================================
-- RPC — segredo de webhook da conta (Vault). Sensível: só service_role.
--   espelha get_focus_token; SECURITY DEFINER (lê vault.decrypted_secrets).
-- =============================================================================
create or replace function public.get_pagarme_webhook_secret(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref    text;
  v_secret text;
begin
  select webhook_secret_ref into v_ref
  from public.pagarme_accounts
  where slug = p_slug and active = true;

  if v_ref is null then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = v_ref;

  return v_secret;
end;
$$;

revoke all on function public.get_pagarme_webhook_secret(text) from public, anon, authenticated;
grant execute on function public.get_pagarme_webhook_secret(text) to service_role;
