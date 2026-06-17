-- =============================================================================
-- NFS-e — automação via pg_cron
--
-- Agenda o nfse-worker:
--   - drain     (a cada 1 min): drena a fila `queued` e emite no Focus;
--   - reconcile (a cada 5 min): reconsulta jobs presos em
--                processing_authorization/submitting (caso o webhook do Focus
--                não tenha chegado).
--
-- O cron invoca a Edge Function por HTTP (pg_net). URL e segredo do worker
-- ficam no Vault (env-agnóstico): se ausentes (ex.: local), o tick é no-op.
--   - `nfse_worker_url`    = https://<ref>.supabase.co/functions/v1/nfse-worker
--   - `nfse_worker_secret` = mesmo valor de NFSE_WORKER_SECRET (env da function)
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.nfse_cron_invoke(p_mode text default 'drain')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_target text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'nfse_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'nfse_worker_secret';

  if v_url is null or v_secret is null then
    return; -- não configurado (ex.: ambiente local) -> no-op seguro
  end if;

  v_target := case when p_mode = 'reconcile' then v_url || '?mode=reconcile' else v_url end;

  perform net.http_post(
    url := v_target,
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.nfse_cron_invoke(text) from public, anon, authenticated;

-- (re)agenda de forma idempotente
select cron.unschedule('nfse-drain') where exists (select 1 from cron.job where jobname = 'nfse-drain');
select cron.unschedule('nfse-reconcile')
where exists (select 1 from cron.job where jobname = 'nfse-reconcile');

select cron.schedule('nfse-drain', '* * * * *', $$select public.nfse_cron_invoke('drain')$$);
select cron.schedule('nfse-reconcile', '*/5 * * * *', $$select public.nfse_cron_invoke('reconcile')$$);
