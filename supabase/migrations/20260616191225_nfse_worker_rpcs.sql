-- RPCs do nfse-worker:
--   claim_nfse_jobs  — reivindica jobs 'queued' atomicamente (FOR UPDATE SKIP
--                      LOCKED), marca 'submitting' e os retorna. Permite vários
--                      workers concorrentes sem processar o mesmo job 2x.
--   get_focus_token  — retorna o token do Focus (do Vault) da empresa. Sensível:
--                      só service_role pode executar.
-- Ambas SECURITY DEFINER (rodam como owner, bypassam RLS).

create or replace function public.claim_nfse_jobs(p_limit int default 10)
returns setof public.invoice_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.invoice_jobs j
  set status = 'submitting',
      last_attempt_at = now(),
      attempts = attempts + 1
  where j.id in (
    select id
    from public.invoice_jobs
    where status = 'queued'
      and (next_attempt_at is null or next_attempt_at <= now())
    order by created_at
    for update skip locked
    limit greatest(p_limit, 0)
  )
  returning j.*;
end;
$$;

create or replace function public.get_focus_token(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_token text;
begin
  select focus_token_ref into v_ref
  from public.fiscal_company_settings
  where company_id = p_company_id;

  if v_ref is null then
    return null;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = v_ref;

  return v_token;
end;
$$;

-- Uso EXCLUSIVO do worker (service role). Não expor a usuários autenticados/anon
-- (get_focus_token devolve segredo).
revoke all on function public.claim_nfse_jobs(int) from public, anon, authenticated;
revoke all on function public.get_focus_token(uuid) from public, anon, authenticated;
grant execute on function public.claim_nfse_jobs(int) to service_role;
grant execute on function public.get_focus_token(uuid) to service_role;
