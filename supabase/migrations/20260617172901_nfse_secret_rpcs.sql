-- =============================================================================
-- NFS-e — fluxo de segredos 100% pelo frontend (sem SQL/Vault manual)
--
-- O frontend (anon key + RLS) não pode escrever no Vault. Estas RPCs
-- SECURITY DEFINER fecham o ciclo de forma segura:
--   - autorizam pelo próprio usuário logado (has_company_access, via auth.uid());
--   - escrevem o segredo no Vault e gravam só a REFERÊNCIA na tabela;
--   - nunca expõem o segredo de volta (exceto o segredo de webhook recém-gerado,
--     revelado UMA vez para o usuário colar no pagar.me).
-- Concedidas a `authenticated` (a autorização é interna).
--
-- Também: slug da conexão passa a ser AUTOMÁTICO (derivado do nome), para o
-- usuário nunca precisar inventar/digitar slug.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- slug automático a partir do label (estável: só gera quando vazio, no insert)
-- -----------------------------------------------------------------------------
alter table public.pagarme_accounts alter column slug set default '';

create or replace function public.nfse_set_account_slug()
returns trigger
language plpgsql
as $$
declare
  v_base text;
  v_slug text;
  v_n    int := 1;
begin
  if new.slug is not null and new.slug <> '' then
    return new; -- slug explícito: respeita (não muda em updates)
  end if;

  v_base := regexp_replace(lower(coalesce(new.label, 'conta')), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  if v_base = '' then
    v_base := 'conta';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.pagarme_accounts where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

create trigger trg_pagarme_accounts_slug
  before insert on public.pagarme_accounts
  for each row execute function public.nfse_set_account_slug();

-- -----------------------------------------------------------------------------
-- segredo de webhook: gera (server-side), guarda no Vault, devolve UMA vez
-- -----------------------------------------------------------------------------
create or replace function public.rotate_account_webhook_secret(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner    uuid;
  v_name     text;
  v_existing uuid;
  v_secret   text;
begin
  select owner_company_id into v_owner
  from public.pagarme_accounts
  where id = p_account_id;

  if v_owner is null then
    raise exception 'conta inexistente';
  end if;
  if not public.has_company_access(v_owner) then
    raise exception 'sem acesso a esta conexão';
  end if;

  -- segredo forte sem dependência de extensão (2x uuid hex = 64 chars)
  v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_name := 'pagarme_webhook_' || replace(p_account_id::text, '-', '');

  select id into v_existing from vault.secrets where name = v_name;
  if v_existing is null then
    perform vault.create_secret(v_secret, v_name, 'Webhook pagar.me (NFS-e)');
  else
    perform vault.update_secret(v_existing, v_secret);
  end if;

  update public.pagarme_accounts set webhook_secret_ref = v_name where id = p_account_id;

  return v_secret;
end;
$$;

revoke all on function public.rotate_account_webhook_secret(uuid) from public, anon;
grant execute on function public.rotate_account_webhook_secret(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- token do Focus: recebe do campo seguro, guarda no Vault, grava a referência
-- -----------------------------------------------------------------------------
create or replace function public.set_company_focus_token(p_company_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text;
  v_existing uuid;
begin
  if not public.has_company_access(p_company_id) then
    raise exception 'sem acesso a esta empresa';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'token vazio';
  end if;

  v_name := 'focus_token_' || replace(p_company_id::text, '-', '');

  select id into v_existing from vault.secrets where name = v_name;
  if v_existing is null then
    perform vault.create_secret(trim(p_token), v_name, 'Focus NFe token (NFS-e)');
  else
    perform vault.update_secret(v_existing, trim(p_token));
  end if;

  insert into public.fiscal_company_settings (company_id, focus_token_ref)
  values (p_company_id, v_name)
  on conflict (company_id) do update set focus_token_ref = v_name;
end;
$$;

revoke all on function public.set_company_focus_token(uuid, text) from public, anon;
grant execute on function public.set_company_focus_token(uuid, text) to authenticated;
