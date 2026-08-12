-- =============================================================================
-- pagar.me — endurecimento para a carga real (go-live)
-- Doc: docs/integrations/pagarme-sales-plan.md
--
-- Três correções encontradas ao conferir o remoto contra os DADOS REAIS do grupo
-- (as fases anteriores foram validadas contra um cenário sintético de UMA conta e
-- UMA carteira; a realidade tem quatro conexões e três carteiras):
--
--  1. SANDBOX POLUIRIA O LEDGER. `pagarme_active_sync_accounts` devolvia toda
--     conta ativa com chave — inclusive as de HOMOLOGAÇÃO, que existem para
--     testar a emissão de nota. O cron de liquidação passaria a gravar vendas de
--     teste como recebível de verdade da Jimmy. Ledger financeiro é fonte de
--     verdade: só produção entra.
--
--  2. A RCO RECEBE POR DUAS CONEXÕES. `pagarme_recipient_map` mostra a RCO como
--     recebedora tanto na conta dela quanto DENTRO da conta da Jimmy — e ela já
--     tem duas carteiras ("rco tec 1" e "rco tec 2 - jce"). A projeção era por
--     empresa (`limit 1` na configuração habilitada), o que produzia dois erros:
--       · a segunda conexão nunca era projetada;
--       · se fosse, colidiria na chave (que não tinha a conexão) e a limpeza de
--         órfãos de uma conexão APAGARIA os lançamentos da outra, porque o
--         `delete` era escopado só por empresa + janela.
--     Agora a projeção é por (empresa × conexão), a chave inclui a conexão e a
--     limpeza é escopada pelo prefixo dela.
--
--  3. A CARTEIRA DO GATEWAY JÁ EXISTE. Eles já operam três contas "Pagar-me …"
--     (tipadas `investment_fund`) onde hoje lançam o saldo a receber à mão.
--     `pagarme_setup_gateway_account` criava uma carteira NOVA, o que daria duas
--     carteiras por empresa e deixaria o histórico manual órfão. Agora ela adota
--     a conta existente (e corrige o tipo), preservando saldo e extrato.
--
-- Chave de projeção muda de formato. Seguro agora e só agora: nenhuma linha com
-- `pagarme_projection_key` existe em produção (a projeção nunca rodou). Nada
-- consome o formato — o resto do sistema só testa null / não-null.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sync só em produção
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
    -- homologação existe para exercitar a esteira FISCAL; venda de teste não
    -- pode virar recebível, receita nem título a receber
    and a.ambiente = 'producao'
  order by a.slug;
$$;

revoke all on function public.pagarme_active_sync_accounts() from public, anon, authenticated;
grant execute on function public.pagarme_active_sync_accounts() to service_role;

comment on function public.pagarme_active_sync_accounts() is
  'Conexões pagar.me elegíveis ao sync do ledger: ativas, com chave no Vault e em PRODUÇÃO (sandbox não entra no financeiro).';

-- -----------------------------------------------------------------------------
-- 2. Backfill histórico também recusa sandbox
--
-- Mesma razão do item 1, no outro caminho de escrita: um lote apontado para a
-- conta de homologação importaria as vendas de teste em massa.
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
  v_owner    uuid;
  v_org      uuid;
  v_ambiente text;
  v_run      uuid;
begin
  select owner_company_id, organization_id, ambiente::text
    into v_owner, v_org, v_ambiente
  from public.pagarme_accounts
  where id = p_account_id and active = true;

  if v_owner is null then
    raise exception 'conexão pagar.me inexistente ou inativa'
      using errcode = 'no_data_found';
  end if;

  if v_ambiente <> 'producao' then
    raise exception 'carga histórica só em produção (esta conexão é de %)', v_ambiente
      using errcode = 'check_violation';
  end if;

  if not public.has_company_write_access(v_owner) then
    raise exception 'sem permissão de escrita nesta conexão'
      using errcode = 'insufficient_privilege';
  end if;

  if p_window_end < p_window_start then
    raise exception 'janela inválida: fim antes do início'
      using errcode = 'check_violation';
  end if;

  -- já existe lote rodando para esta conexão? devolve o mesmo (idempotente na UI)
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

-- -----------------------------------------------------------------------------
-- 3. pagarme_setup_gateway_account — adota a carteira que já existe
--
-- `p_gateway_bank_account_id` informado = adota aquela conta como carteira do
-- gateway (corrigindo o tipo para `payment_gateway`). Ausente = comportamento
-- anterior (encontra/cria `pagar.me — <slug>`).
--
-- Adotar é o caminho certo aqui: a conta "Pagar-me …" já carrega o histórico
-- manual, e o corte (D4) é justamente a fronteira entre o manual anterior e a
-- projeção posterior. Carteira nova quebraria essa continuidade.
--
-- `drop` antes de recriar porque a assinatura ganhou parâmetro: manter as duas
-- deixaria a chamada por nome ambígua no PostgREST.
-- -----------------------------------------------------------------------------
drop function if exists public.pagarme_setup_gateway_account(uuid, uuid, uuid, date);

create or replace function public.pagarme_setup_gateway_account(
  p_account_id uuid,
  p_company_id uuid,
  p_payout_bank_account_id uuid default null,
  p_cutover_date date default '2026-09-01',
  p_gateway_bank_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_slug     text;
  v_gateway  uuid;
  v_nickname text;
  v_settings uuid;
begin
  select organization_id, slug into v_org, v_slug
  from public.pagarme_accounts where id = p_account_id and active = true;
  if v_org is null then
    raise exception 'conexão pagar.me inexistente ou inativa' using errcode = 'no_data_found';
  end if;

  if not public.has_company_write_access(p_company_id) then
    raise exception 'sem permissão de escrita nesta empresa' using errcode = 'insufficient_privilege';
  end if;

  if p_gateway_bank_account_id is not null then
    -- validar o vínculo com a empresa: sem isto, um id de outra empresa faria a
    -- receita ser lançada na conta errada
    select id into v_gateway
    from public.bank_accounts
    where id = p_gateway_bank_account_id and company_id = p_company_id;

    if v_gateway is null then
      raise exception 'conta bancária inexistente ou de outra empresa'
        using errcode = 'no_data_found';
    end if;

    update public.bank_accounts
    set account_type = 'payment_gateway'
    where id = v_gateway and account_type <> 'payment_gateway';
  else
    v_nickname := 'pagar.me — ' || v_slug;

    select id into v_gateway
    from public.bank_accounts
    where company_id = p_company_id and nickname = v_nickname;

    if v_gateway is null then
      insert into public.bank_accounts (
        company_id, bank_name, account_type, nickname, is_active, sort_order,
        initial_balance, initial_balance_date, notes
      ) values (
        p_company_id, 'pagar.me', 'payment_gateway', v_nickname, true, 900,
        0, p_cutover_date,
        'Carteira do gateway: recebe as liquidações, paga as taxas de adquirência e '
        || 'sai por transferência para a conta bancária. Criada por pagarme_setup_gateway_account.'
      )
      returning id into v_gateway;
    end if;
  end if;

  insert into public.pagarme_ledger_settings (
    organization_id, pagarme_account_id, company_id,
    gateway_bank_account_id, payout_bank_account_id,
    revenue_account_id, fee_account_id, anticipation_account_id, refund_account_id,
    cutover_date, enabled
  )
  select
    v_org, p_account_id, p_company_id,
    v_gateway, p_payout_bank_account_id,
    (select id from public.chart_of_accounts where company_id = p_company_id and code = '1.01'),
    (select id from public.chart_of_accounts where company_id = p_company_id and code = '7.09'),
    (select id from public.chart_of_accounts where company_id = p_company_id and code = '7.10'),
    (select id from public.chart_of_accounts where company_id = p_company_id and code = '2.09'),
    p_cutover_date, false          -- nasce DESLIGADA: liga-se após conferir
  on conflict (pagarme_account_id, company_id) do update
    set gateway_bank_account_id = excluded.gateway_bank_account_id,
        payout_bank_account_id  = coalesce(excluded.payout_bank_account_id,
                                           public.pagarme_ledger_settings.payout_bank_account_id),
        cutover_date            = excluded.cutover_date,
        updated_at              = now()
  returning id into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.pagarme_setup_gateway_account(uuid, uuid, uuid, date, uuid)
  from public, anon;
grant execute on function public.pagarme_setup_gateway_account(uuid, uuid, uuid, date, uuid)
  to authenticated;

comment on function public.pagarme_setup_gateway_account(uuid, uuid, uuid, date, uuid) is
  'Configura a carteira do gateway de uma empresa para uma conexão pagar.me. Adota a conta informada (corrigindo o tipo) ou cria uma nova. A projeção nasce desligada.';

-- =============================================================================
-- 4. pagarme_project_ledger — agora por (empresa × conexão)
--
-- Mudanças em relação à versão anterior:
--   · percorre TODAS as configurações habilitadas da empresa (uma por conexão),
--     em vez de `limit 1`;
--   · `p_pagarme_account_id` permite projetar uma conexão isolada;
--   · a chave de projeção inclui a conexão;
--   · a limpeza de órfãos é escopada pelo prefixo da conexão, para que projetar
--     uma nunca apague os lançamentos da outra.
--
-- O resto da regra é a da Fase 3 e não mudou: agregação por
-- (tipo × liquidação × mês de competência × liquidado?), receita bruta (D1),
-- competência na venda (D2), nada antes do corte (D4), estorno no período
-- corrente (D5). Idempotente; nunca toca lançamento humano nem conciliado.
-- =============================================================================
drop function if exists public.pagarme_project_ledger(uuid, date, date);

create or replace function public.pagarme_project_ledger(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_pagarme_account_id uuid default null
)
returns table (
  kind text,
  lancamentos int,
  valor numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.pagarme_ledger_settings%rowtype;
  v_from     date;
  v_prefix   text;
begin
  if not public.has_company_write_access(p_company_id) then
    raise exception 'sem permissão de escrita nesta empresa' using errcode = 'insufficient_privilege';
  end if;

  -- acumulador do resultado: uma empresa pode ter mais de uma conexão e o
  -- retorno é consolidado por tipo de lançamento
  drop table if exists _proj_total;
  create temp table _proj_total (kind text, lancamentos int, valor numeric) on commit drop;

  for v_settings in
    select *
    from public.pagarme_ledger_settings s
    where s.company_id = p_company_id
      and s.enabled = true
      and (p_pagarme_account_id is null or s.pagarme_account_id = p_pagarme_account_id)
    order by s.created_at
  loop
    if v_settings.gateway_bank_account_id is null or v_settings.revenue_account_id is null then
      raise exception 'configuração incompleta na conexão %: falta carteira do gateway ou conta de receita',
        v_settings.pagarme_account_id
        using errcode = 'no_data_found';
    end if;

    -- D4: nunca projeta antes do corte, para não duplicar o histórico manual
    v_from := greatest(p_from, v_settings.cutover_date);
    if v_from > p_to then
      continue;
    end if;

    v_prefix := 'pagarme:' || p_company_id::text || ':' || v_settings.pagarme_account_id::text || ':';

    -- -------------------------------------------------------------------------
    -- Grupos recalculados a partir dos recebíveis vigentes
    --
    -- `drop if exists` antes do create: `on commit drop` só limpa no COMMIT, e
    -- aqui a temp table é recriada a cada conexão do laço.
    -- -------------------------------------------------------------------------
    drop table if exists _proj;

    create temp table _proj on commit drop as
    with recv as (
      select
        r.id,
        r.expected_payment_date                        as settle_on,
        date_trunc('month', r.sale_accrual_at)::date   as accrual_month,
        r.sale_accrual_at::date                        as accrual_date,
        r.status = 'paid'                              as is_settled,
        r.type,
        r.amount,
        r.fee,
        r.anticipation_fee,
        r.fraud_coverage_fee
      from public.pagarme_receivables r
      where r.company_id = p_company_id
        and r.pagarme_account_id = v_settings.pagarme_account_id
        and r.expected_payment_date between v_from and p_to
        -- sem data de competência não há como classificar o mês; fica de fora e
        -- aparece em v_pagarme_ledger_health
        and r.sale_accrual_at is not null
    )
    -- receita: só crédito (estorno tem tratamento próprio)
    select
      'revenue'::text as kind,
      settle_on,
      accrual_month,
      is_settled,
      max(accrual_date) as accrual_date,
      sum(amount)       as amount,
      array_agg(id)     as receivable_ids
    from recv
    where type = 'credit'
    group by settle_on, accrual_month, is_settled

    union all
    -- MDR: custo do recebimento, incorrido na liquidação (competência = caixa)
    select 'fee', settle_on, accrual_month, is_settled,
           max(accrual_date), sum(fee + fraud_coverage_fee), array_agg(id)
    from recv
    where type = 'credit' and (fee + fraud_coverage_fee) > 0
    group by settle_on, accrual_month, is_settled

    union all
    select 'anticipation', settle_on, accrual_month, is_settled,
           max(accrual_date), sum(anticipation_fee), array_agg(id)
    from recv
    where anticipation_fee > 0
    group by settle_on, accrual_month, is_settled

    union all
    -- D5: estorno/chargeback deduz no período em que aparece.
    -- `abs`: o payable de estorno pode chegar com valor negativo (a API varia), e
    -- o recebível preserva o sinal da origem. Aqui importa a MAGNITUDE, já que o
    -- lançamento é uma saída — sem o abs, um estorno negativo cairia no filtro
    -- `amount > 0` e desapareceria em silêncio.
    select 'refund', settle_on, accrual_month, is_settled,
           max(accrual_date), sum(abs(amount)), array_agg(id)
    from recv
    where type in ('refund', 'chargeback')
    group by settle_on, accrual_month, is_settled;

    alter table _proj add column proj_key text;
    alter table _proj add column account_id uuid;
    alter table _proj add column direction public.transaction_direction;

    -- Colunas qualificadas com `_proj.`: `kind` também é nome de coluna de saída
    -- da função (RETURNS TABLE), e sem a qualificação o PL/pgSQL não sabe qual é.
    update _proj set
      proj_key = v_prefix || _proj.kind || ':' ||
                 _proj.settle_on::text || ':' || to_char(_proj.accrual_month, 'YYYY-MM') ||
                 case when _proj.is_settled then '' else ':pending' end,
      direction = (case when _proj.kind = 'revenue' then 'inflow' else 'outflow' end)
                    ::public.transaction_direction,
      account_id = case _proj.kind
        when 'revenue'      then v_settings.revenue_account_id
        when 'fee'          then coalesce(v_settings.fee_account_id, v_settings.revenue_account_id)
        when 'anticipation' then coalesce(v_settings.anticipation_account_id, v_settings.fee_account_id)
        when 'refund'       then coalesce(v_settings.refund_account_id, v_settings.revenue_account_id)
      end;

    -- -------------------------------------------------------------------------
    -- Upsert dos lançamentos
    -- -------------------------------------------------------------------------
    insert into public.transactions (
      company_id, account_id, bank_account_id, amount, direction, status,
      accrual_date, due_date, cash_date, description, pagarme_projection_key, metadata
    )
    select
      p_company_id,
      p.account_id,
      v_settings.gateway_bank_account_id,
      p.amount,
      p.direction,
      -- pendente = ainda não liquidou: é ISSO que faz o recebível aparecer no
      -- "A Receber" e no forecast (que somam pending/scheduled por due_date)
      case when p.is_settled then 'settled'::public.transaction_status
           else 'pending'::public.transaction_status end,
      p.accrual_date,
      p.settle_on,
      case when p.is_settled then p.settle_on end,
      case p.kind
        when 'revenue'      then 'Vendas pagar.me'
        when 'fee'          then 'Taxas pagar.me (MDR)'
        when 'anticipation' then 'Antecipação de recebíveis pagar.me'
        when 'refund'       then 'Estornos/chargebacks pagar.me'
      end
        || ' — competência ' || to_char(p.accrual_month, 'MM/YYYY')
        || ', liquidação ' || to_char(p.settle_on, 'DD/MM/YYYY'),
      p.proj_key,
      jsonb_build_object(
        'source', 'pagarme',
        'kind', p.kind,
        'settlementDate', p.settle_on,
        'accrualMonth', to_char(p.accrual_month, 'YYYY-MM'),
        'receivableCount', array_length(p.receivable_ids, 1),
        'pagarmeAccountId', v_settings.pagarme_account_id
      )
    from _proj p
    where p.amount > 0
    on conflict (pagarme_projection_key) where pagarme_projection_key is not null
    do update set
      amount      = excluded.amount,
      account_id  = excluded.account_id,
      status      = excluded.status,
      accrual_date= excluded.accrual_date,
      due_date    = excluded.due_date,
      cash_date   = excluded.cash_date,
      description = excluded.description,
      metadata    = excluded.metadata,
      updated_at  = now()
    -- lançamento já conciliado não é mexido: conciliação é ato humano e a
    -- divergência deve aparecer no relatório, não ser sobrescrita em silêncio
    where public.transactions.status <> 'reconciled';

    -- -------------------------------------------------------------------------
    -- Amarra recebível -> lançamento (rastreabilidade e recompute)
    -- -------------------------------------------------------------------------
    update public.pagarme_receivables r
    set transaction_id = t.id
    from _proj p
    join public.transactions t on t.pagarme_projection_key = p.proj_key
    where p.kind = 'revenue'
      and r.id = any (p.receivable_ids)
      and (r.transaction_id is distinct from t.id);

    -- -------------------------------------------------------------------------
    -- Limpa grupos que deixaram de existir (ex.: recebível antecipado mudou de
    -- dia). Só o que a PRÓPRIA projeção criou, DESTA conexão (o prefixo), na
    -- janela, e não conciliado. O prefixo é o que protege a outra conexão da
    -- mesma empresa — sem ele, projetar a conta da Jimmy apagaria o que a conta
    -- da RCO havia lançado.
    -- -------------------------------------------------------------------------
    delete from public.transactions t
    where t.company_id = p_company_id
      and t.pagarme_projection_key like v_prefix || '%'
      and t.due_date between v_from and p_to
      and t.status <> 'reconciled'
      and not exists (select 1 from _proj p where p.proj_key = t.pagarme_projection_key);

    insert into _proj_total (kind, lancamentos, valor)
    select p.kind, count(*)::int, sum(p.amount)::numeric
    from _proj p
    where p.amount > 0
    group by p.kind;
  end loop;

  return query
  select tot.kind, sum(tot.lancamentos)::int, sum(tot.valor)::numeric
  from _proj_total tot
  group by tot.kind
  order by tot.kind;
end;
$$;

revoke all on function public.pagarme_project_ledger(uuid, date, date, uuid) from public, anon;
grant execute on function public.pagarme_project_ledger(uuid, date, date, uuid) to authenticated;

comment on function public.pagarme_project_ledger(uuid, date, date, uuid) is
  'Projeta os recebíveis do pagar.me em lançamentos agregados por (empresa × conexão × tipo × liquidação × mês de competência). Idempotente; nunca toca lançamento humano nem conciliado.';
