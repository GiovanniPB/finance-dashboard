-- =============================================================================
-- NFS-e backfill — timeout do net.http_post do cron
--
-- Sintoma: o `nfse-backfill` hidrata cobrança por cobrança (detalhe + payables +
-- ViaCEP), levando dezenas de segundos por página. O `net.http_post` usa timeout
-- DEFAULT de 5s -> o pg_net cortava a conexão em 5s e a função (que processa 1
-- página por invocação) não conseguia reportar/concluir de forma confiável.
--
-- Correção: subir o timeout para 55s (folga sobre 1 página; o cron re-aciona a
-- cada 2 min para as páginas seguintes). Recria a função mantendo o resto igual.
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
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.nfse_backfill_cron_invoke() from public, anon, authenticated;
