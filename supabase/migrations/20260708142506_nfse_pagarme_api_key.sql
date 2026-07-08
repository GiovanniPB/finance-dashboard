-- =============================================================================
-- NFS-e — Secret Key (sk_) do pagar.me por conta, no Vault
-- Doc: docs/integrations/nfse-backfill-plan.md
--
-- Até aqui a integração pagar.me era só ENTRADA (webhooks). O backfill precisa
-- LER cobranças (GET /charges + GET /charges/{id}), o que exige a Secret Key
-- (sk_...) da conta. Guardamos no Vault (por conta), espelhando exatamente o
-- padrão do token do Focus:
--   - set_pagarme_api_key  -> escrita pela UI (authenticated, autoriza por
--                             has_company_access da empresa dona da conta);
--   - get_pagarme_api_key  -> leitura só pelo worker (service_role).
-- A tabela guarda apenas a REFERÊNCIA ao segredo, nunca o valor.
-- =============================================================================

alter table public.pagarme_accounts
  add column pagarme_api_key_ref text;

-- -----------------------------------------------------------------------------
-- set: recebe a sk_ do campo seguro, guarda no Vault, grava a referência.
-- Espelha set_company_focus_token (authorização interna via has_company_access).
-- -----------------------------------------------------------------------------
create or replace function public.set_pagarme_api_key(p_account_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner    uuid;
  v_name     text;
  v_existing uuid;
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
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'chave vazia';
  end if;

  v_name := 'pagarme_api_key_' || replace(p_account_id::text, '-', '');

  select id into v_existing from vault.secrets where name = v_name;
  if v_existing is null then
    perform vault.create_secret(trim(p_key), v_name, 'Secret Key pagar.me (NFS-e backfill)');
  else
    perform vault.update_secret(v_existing, trim(p_key));
  end if;

  update public.pagarme_accounts set pagarme_api_key_ref = v_name where id = p_account_id;
end;
$$;

revoke all on function public.set_pagarme_api_key(uuid, text) from public, anon;
grant execute on function public.set_pagarme_api_key(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- get: retorna a sk_ do Vault. Sensível: só service_role (usado pelo worker de
-- backfill). Espelha get_pagarme_webhook_secret / get_focus_token.
-- -----------------------------------------------------------------------------
create or replace function public.get_pagarme_api_key(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_key text;
begin
  select pagarme_api_key_ref into v_ref
  from public.pagarme_accounts
  where id = p_account_id and active = true;

  if v_ref is null then
    return null;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = v_ref;

  return v_key;
end;
$$;

revoke all on function public.get_pagarme_api_key(uuid) from public, anon, authenticated;
grant execute on function public.get_pagarme_api_key(uuid) to service_role;
