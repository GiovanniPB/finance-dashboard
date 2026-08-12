-- =============================================================================
-- pagar.me — RPCs do sync + automação por pg_cron
--
-- Espelha o que já funciona na esteira NFS-e (claim SKIP LOCKED + cron_invoke via
-- pg_net com URL/segredo no Vault), adaptado aos três modos do sync de vendas:
--
--   backfill    — drena `pagarme_sync_runs` (enumeração paginada e resumível)
--   settlements — lê `/balance/operations` e realiza as liquidações
--   maturity    — reconsulta `/payables` das cobranças cujo recebível vence
--
-- Por que `maturity` existe além de `settlements`: o `/payables` GLOBAL tem
-- paginação quebrada (`paging: {}`), então não há como varrer recebíveis. As
-- operações de saldo são a via primária; a maturidade é a rede de segurança,
-- limitada às cobranças que têm parcela vencendo — conjunto pequeno por dia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- claim_pagarme_sync_run — reivindica um lote de sync atomicamente
--
-- Vários ticks do cron podem se sobrepor (uma invocação pode demorar mais que o
-- intervalo). FOR UPDATE SKIP LOCKED garante que dois workers não peguem o mesmo
-- run. `attempts` sobe a cada reivindicação para o worker poder desistir.
-- -----------------------------------------------------------------------------
create or replace function public.claim_pagarme_sync_run()
returns setof public.pagarme_sync_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.pagarme_sync_runs r
  set attempts = r.attempts + 1
  where r.id = (
    select id
    from public.pagarme_sync_runs
    where status = 'running'
    order by created_at
    for update skip locked
    limit 1
  )
  returning r.*;
end;
$$;

-- -----------------------------------------------------------------------------
-- pagarme_charges_needing_maturity_sync — quais cobranças reconsultar
--
-- Cobranças com recebível `waiting_funds` cuja liquidação já passou (ou está a
-- poucos dias). Ordena pelas mais atrasadas primeiro: se o limite cortar, a
-- próxima invocação continua de onde importa.
--
-- `p_grace_days` cobre o intervalo entre a data prevista e o crédito efetivo.
-- -----------------------------------------------------------------------------
create or replace function public.pagarme_charges_needing_maturity_sync(
  p_account_id uuid,
  p_limit int default 50,
  p_grace_days int default 3
)
returns table (pagarme_charge_id text)
language sql
stable
security definer
set search_path = public
as $$
  select r.pagarme_charge_id
  from public.pagarme_receivables r
  where r.pagarme_account_id = p_account_id
    and r.status = 'waiting_funds'
    and r.pagarme_charge_id is not null
    and r.expected_payment_date <= current_date + p_grace_days
  group by r.pagarme_charge_id
  order by min(r.expected_payment_date)
  limit greatest(p_limit, 0);
$$;

-- -----------------------------------------------------------------------------
-- pagarme_active_sync_accounts — contas elegíveis a sync
--
-- Só conta ativa E com secret key no Vault: sem chave não há como consultar a
-- API, e tentar geraria erro em loop no cron.
-- -----------------------------------------------------------------------------
create or replace function public.pagarme_active_sync_accounts()
returns table (id uuid, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.slug
  from public.pagarme_accounts a
  where a.active = true
    and a.api_secret_ref is not null
  order by a.slug;
$$;

-- -----------------------------------------------------------------------------
-- pagarme_start_backfill — dispara um lote histórico (chamado pela UI)
--
-- Cria o `pagarme_sync_runs` que o cron drena. `SECURITY DEFINER` porque precisa
-- ler `pagarme_accounts` e escrever o run, mas AUTORIZA internamente por
-- `has_company_write_access` da empresa dona — mesmo padrão das RPCs de segredo
-- da esteira fiscal (o front nunca usa service role).
--
-- Janela obrigatória: evita "importar tudo" por acidente. Lote já em andamento
-- para a mesma conta/recurso é reaproveitado em vez de duplicado.
-- -----------------------------------------------------------------------------
create or replace function public.pagarme_start_backfill(
  p_account_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_dry_run boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_org   uuid;
  v_run   uuid;
begin
  select owner_company_id, organization_id into v_owner, v_org
  from public.pagarme_accounts
  where id = p_account_id and active = true;

  if v_owner is null then
    raise exception 'conta pagar.me inexistente ou inativa'
      using errcode = 'no_data_found';
  end if;

  if not public.has_company_write_access(v_owner) then
    raise exception 'sem permissão de escrita nesta conexão'
      using errcode = 'insufficient_privilege';
  end if;

  if p_window_end < p_window_start then
    raise exception 'janela inválida: fim antes do início'
      using errcode = 'check_violation';
  end if;

  -- já existe lote rodando para esta conta? devolve o mesmo (idempotente na UI)
  select id into v_run
  from public.pagarme_sync_runs
  where pagarme_account_id = p_account_id
    and resource = 'charges'
    and status = 'running'
  limit 1;

  if v_run is not null then
    return v_run;
  end if;

  insert into public.pagarme_sync_runs (
    organization_id, pagarme_account_id, resource,
    window_start, window_end, dry_run, created_by
  ) values (
    v_org, p_account_id, 'charges',
    p_window_start, p_window_end, p_dry_run, auth.uid()
  )
  returning id into v_run;

  return v_run;
end;
$$;

revoke all on function public.pagarme_start_backfill(uuid, timestamptz, timestamptz, boolean)
  from public, anon;
grant execute on function public.pagarme_start_backfill(uuid, timestamptz, timestamptz, boolean)
  to authenticated;

revoke all on function public.claim_pagarme_sync_run() from public, anon, authenticated;
revoke all on function public.pagarme_charges_needing_maturity_sync(uuid, int, int)
  from public, anon, authenticated;
revoke all on function public.pagarme_active_sync_accounts() from public, anon, authenticated;
grant execute on function public.claim_pagarme_sync_run() to service_role;
grant execute on function public.pagarme_charges_needing_maturity_sync(uuid, int, int) to service_role;
grant execute on function public.pagarme_active_sync_accounts() to service_role;

-- -----------------------------------------------------------------------------
-- Automação — mesmo desenho do `nfse_cron_invoke`: URL e segredo no Vault, para
-- que o agendamento seja env-agnóstico. Ausentes (ex.: local) => tick no-op.
--   `pagarme_sync_url`    = https://<ref>.supabase.co/functions/v1/pagarme-sync
--   `pagarme_sync_secret` = mesmo valor de PAGARME_SYNC_SECRET (env da function)
-- -----------------------------------------------------------------------------
create or replace function public.pagarme_cron_invoke(p_mode text default 'settlements')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'pagarme_sync_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'pagarme_sync_secret';

  if v_url is null or v_secret is null then
    return; -- não configurado -> no-op seguro
  end if;

  perform net.http_post(
    url := v_url || '?mode=' || p_mode,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.pagarme_cron_invoke(text) from public, anon, authenticated;

-- (re)agenda idempotente
select cron.unschedule('pagarme-settlements')
where exists (select 1 from cron.job where jobname = 'pagarme-settlements');
select cron.unschedule('pagarme-maturity')
where exists (select 1 from cron.job where jobname = 'pagarme-maturity');
select cron.unschedule('pagarme-subscriptions')
where exists (select 1 from cron.job where jobname = 'pagarme-subscriptions');
select cron.unschedule('pagarme-backfill')
where exists (select 1 from cron.job where jobname = 'pagarme-backfill');

-- Liquidação: de hora em hora. O crédito do pagar.me pinga ao longo do dia e
-- quanto mais fresco o caixa, melhor a projeção.
select cron.schedule(
  'pagarme-settlements', '7 * * * *',
  $$select public.pagarme_cron_invoke('settlements')$$
);

-- Maturidade: 1×/dia de manhã. Rede de segurança do que as operações de saldo
-- não pegaram, e é onde antecipação/estorno aparecem.
select cron.schedule(
  'pagarme-maturity', '20 9 * * *',
  $$select public.pagarme_cron_invoke('maturity')$$
);

-- Assinaturas: 1×/dia. Status/cancelamento mudam devagar (MRR e churn).
select cron.schedule(
  'pagarme-subscriptions', '35 9 * * *',
  $$select public.pagarme_cron_invoke('subscriptions')$$
);

-- Backfill: a cada 2 min, mas só faz algo se existir run 'running'. É o que
-- permite disparar um lote histórico pela UI e ele se drenar sozinho.
select cron.schedule(
  'pagarme-backfill', '*/2 * * * *',
  $$select public.pagarme_cron_invoke('backfill')$$
);

comment on function public.claim_pagarme_sync_run() is
  'Reivindica um lote de sync (FOR UPDATE SKIP LOCKED) para o pagarme-sync.';
comment on function public.pagarme_charges_needing_maturity_sync(uuid, int, int) is
  'Cobranças com recebível vencendo/vencido ainda em waiting_funds — alvo do sweep de maturidade.';
