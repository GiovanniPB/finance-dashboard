-- =============================================================================
-- pagar.me — retomar lote de carga histórica
--
-- POR QUE EXISTE: `claim_pagarme_sync_run` incrementa `attempts` a cada
-- reivindicação, e o worker desistia acima de 8. Como cada tick avança 2 páginas,
-- todo lote com mais de 16 páginas (480 vendas) morria com
-- `max_attempts_exceeded` mesmo indo bem — foi o que aconteceu na primeira carga
-- real da Jimmy (480 de 480 vistas, página 17, "falhou").
--
-- A correção principal está na Edge Function, que agora zera `attempts` no tick
-- que faz progresso — o contador volta a significar "reivindicações sem avanço",
-- que era a intenção. Esta RPC é a outra metade: permite retomar um lote que
-- morreu **do ponto onde parou**, em vez de recomeçar da página 1.
--
-- Idempotência: o cursor é preservado, e todas as escritas do backfill são upsert
-- por chave natural — retomar não duplica nada.
-- =============================================================================
create or replace function public.pagarme_resume_sync_run(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner  uuid;
  v_status public.invoice_backfill_status;
begin
  select a.owner_company_id, r.status
    into v_owner, v_status
  from public.pagarme_sync_runs r
  join public.pagarme_accounts a on a.id = r.pagarme_account_id
  where r.id = p_run_id;

  if v_owner is null then
    raise exception 'lote inexistente' using errcode = 'no_data_found';
  end if;

  if not public.has_company_write_access(v_owner) then
    raise exception 'sem permissão de escrita nesta conexão'
      using errcode = 'insufficient_privilege';
  end if;

  -- lote concluído não volta: reprocessar histórico é "nova carga", explícita
  if v_status = 'completed' then
    raise exception 'lote já concluído; inicie uma nova carga'
      using errcode = 'check_violation';
  end if;

  update public.pagarme_sync_runs
  set status     = 'running',
      attempts   = 0,
      last_error = null
  where id = p_run_id;

  return p_run_id;
end;
$$;

revoke all on function public.pagarme_resume_sync_run(uuid) from public, anon;
grant execute on function public.pagarme_resume_sync_run(uuid) to authenticated;

comment on function public.pagarme_resume_sync_run(uuid) is
  'Retoma um lote de carga histórica do ponto onde parou (preserva o cursor, zera o contador de tentativas).';

-- =============================================================================
-- pagarme_cron_status — a esteira está de fato rodando?
--
-- O modo de falha silenciosa desta integração é o cron agendado que não faz nada:
-- `pagarme_cron_invoke` sai calado quando a URL ou o segredo não estão no Vault
-- (comportamento correto — em local não há função para chamar), e o sintoma é
-- "tudo zerado sem erro nenhum". Foi exatamente o que aconteceu no go-live.
--
-- Esta função expõe agendamento + último resultado para a tela de webhooks poder
-- mostrar isso em vez de deixar o operador adivinhar. Restrita a super admin:
-- fala de infraestrutura, não de dado de empresa.
-- =============================================================================
create or replace function public.pagarme_cron_status()
returns table (
  job_name    text,
  schedule    text,
  active      boolean,
  last_run_at timestamptz,
  last_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.jobname::text,
    j.schedule::text,
    j.active,
    d.start_time,
    d.status::text
  from cron.job j
  left join lateral (
    select r.start_time, r.status
    from cron.job_run_details r
    where r.jobid = j.jobid
    order by r.start_time desc
    limit 1
  ) d on true
  where public.is_super_admin()
    and (j.jobname like 'pagarme%' or j.jobname like 'nfse%')
  order by j.jobname;
$$;

revoke all on function public.pagarme_cron_status() from public, anon;
grant execute on function public.pagarme_cron_status() to authenticated;

comment on function public.pagarme_cron_status() is
  'Agendamentos da esteira (pagar.me e NFS-e) com o último resultado. Vazio para quem não é super admin.';
