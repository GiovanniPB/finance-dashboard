-- =============================================================================
-- Secret key da API do pagar.me por conta (Vault) — para consultar /payables
--
-- O split confiável de uma venda vem de `GET /payables?charge_id=` (crédito −
-- estorno/chargeback por recebedor), não do split[] do webhook. Para chamar a
-- API do pagar.me, cada conta precisa da sua secret key (sk_...) no Vault.
--
-- Mesmo padrão dos demais segredos: o front (anon) não toca o Vault; a RPC
-- SECURITY DEFINER autoriza pelo usuário (has_company_access do dono) e escreve;
-- a leitura (decifrada) é só para service_role (Edge Functions).
-- =============================================================================

alter table public.pagarme_accounts
  add column api_secret_ref text; -- REFERÊNCIA ao segredo no Vault (nunca a chave)

-- grava/atualiza a secret key da conta no Vault (chamado pela UI)
create or replace function public.set_pagarme_account_secret(p_account_id uuid, p_secret text)
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
  if p_secret is null or length(trim(p_secret)) = 0 then
    raise exception 'secret key vazia';
  end if;

  v_name := 'pagarme_api_' || replace(p_account_id::text, '-', '');

  select id into v_existing from vault.secrets where name = v_name;
  if v_existing is null then
    perform vault.create_secret(trim(p_secret), v_name, 'Secret key API pagar.me (split via payables)');
  else
    perform vault.update_secret(v_existing, trim(p_secret));
  end if;

  update public.pagarme_accounts set api_secret_ref = v_name where id = p_account_id;
end;
$$;

revoke all on function public.set_pagarme_account_secret(uuid, text) from public, anon;
grant execute on function public.set_pagarme_account_secret(uuid, text) to authenticated;

-- lê a secret key decifrada da conta (só service_role, usada pela Edge Function)
create or replace function public.get_pagarme_account_secret(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref    text;
  v_secret text;
begin
  select api_secret_ref into v_ref
  from public.pagarme_accounts
  where id = p_account_id and active = true;

  if v_ref is null then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = v_ref;

  return v_secret;
end;
$$;

revoke all on function public.get_pagarme_account_secret(uuid) from public, anon, authenticated;
grant execute on function public.get_pagarme_account_secret(uuid) to service_role;
