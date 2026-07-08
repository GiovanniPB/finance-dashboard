-- =============================================================================
-- NFS-e — automação do backfill via pg_cron
--
-- Aciona a Edge Function `nfse-backfill` a cada 2 min enquanto houver run em
-- `status='running'` (a própria função pega o mais antigo e é no-op se não há
-- nenhum). URL e segredo ficam no Vault (env-agnóstico): ausentes (ex.: local)
-- -> tick no-op. Reusa o `nfse_worker_secret` (a função valida o mesmo
-- NFSE_WORKER_SECRET); só a URL é nova.
--   - `nfse_backfill_url` = https://<ref>.supabase.co/functions/v1/nfse-backfill
--   - `nfse_worker_secret` = mesmo valor de NFSE_WORKER_SECRET (já usado pelo worker)
-- =============================================================================

create or replace function public.nfse_backfill_cron_invoke()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'nfse_backfill_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'nfse_worker_secret';

  if v_url is null or v_secret is null then
    return; -- não configurado (ex.: ambiente local) -> no-op seguro
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.nfse_backfill_cron_invoke() from public, anon, authenticated;

-- (re)agenda de forma idempotente (a cada 2 min)
select cron.unschedule('nfse-backfill')
where exists (select 1 from cron.job where jobname = 'nfse-backfill');

select cron.schedule('nfse-backfill', '*/2 * * * *', $$select public.nfse_backfill_cron_invoke()$$);
