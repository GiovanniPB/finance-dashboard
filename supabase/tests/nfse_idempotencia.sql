-- Idempotência das notas: uma nota por (cobrança, empresa, ambiente).
-- Migration 20260819141651.
--
-- Reproduz o par que gerou 21 NFS-e duplicadas em produção: o webhook chega
-- primeiro SEM split (recipient NULL, valor integral, empresa dona da conta) e o
-- backfill chega depois COM recebedor (`re_...`) para a MESMA cobrança e a MESMA
-- empresa. Sob a chave antiga `(charge, recipient, ambiente)` as duas linhas
-- passavam; aqui a segunda tem de ser engolida pelo `on conflict do nothing`.
--
--   bun run db:reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/nfse_idempotencia.sql
--
-- Roda em transação e termina em rollback.
\set ON_ERROR_STOP on

begin;

create temp table resultado (n serial, cenario text, obtido text);

create or replace function pg_temp.check(p_label text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  insert into resultado (cenario, obtido)
  values (
    p_label,
    case when p_got is not distinct from p_want
      then 'ok'
      else format('FALHOU: obtido=%s esperado=%s', p_got, p_want)
    end
  );
end;
$$;

-- ── Setup: duas empresas na mesma organização.
do $$
declare
  v_org uuid;
  v_comp_a uuid;
  v_comp_b uuid;
begin
  select id into v_org from organizations limit 1;
  insert into companies (organization_id, legal_name, trade_name, is_active)
    values (v_org, 'Emitente A LTDA', 'A', true) returning id into v_comp_a;
  insert into companies (organization_id, legal_name, trade_name, is_active)
    values (v_org, 'Emitente B LTDA', 'B', true) returning id into v_comp_b;

  create temp table ctx as
    select v_org as org, v_comp_a as comp_a, v_comp_b as comp_b;
end;
$$;

-- ── Cenário 1: webhook sem split, depois backfill com recebedor. UMA linha.
do $$
declare
  v_org uuid; v_comp uuid; v_inseridas int;
begin
  select org, comp_a into v_org, v_comp from ctx;

  -- webhook: `/payables` ainda vazio -> sem split -> recipient NULL, valor cheio
  insert into invoice_jobs (organization_id, company_id, pagarme_charge_id,
                            pagarme_recipient_id, ambiente, valor_servicos, metadata)
  values (v_org, v_comp, 'ch_teste_dup', null, 'producao', 4764.00,
          '{"splitSource":"webhook","noSplit":true}'::jsonb);

  -- backfill: horas depois, `/payables` responde -> mesmo job, agora com recebedor
  with ins as (
    insert into invoice_jobs (organization_id, company_id, pagarme_charge_id,
                              pagarme_recipient_id, ambiente, valor_servicos, metadata)
    values (v_org, v_comp, 'ch_teste_dup', 're_abc123', 'producao', 4764.00,
            '{"splitSource":"payables","source":"backfill"}'::jsonb)
    on conflict (dedup_scope) do nothing
    returning 1
  )
  select count(*) into v_inseridas from ins;

  perform pg_temp.check('backfill nao insere segunda linha da mesma venda', v_inseridas, 0);
  perform pg_temp.check(
    'a venda tem exatamente uma nota',
    (select count(*)::int from invoice_jobs where pagarme_charge_id = 'ch_teste_dup'),
    1);
  perform pg_temp.check(
    'a linha que sobrou e a primeira (webhook)',
    (select metadata->>'splitSource' from invoice_jobs where pagarme_charge_id = 'ch_teste_dup'),
    'webhook');
end;
$$;

-- ── Cenário 2: ordem inversa (backfill primeiro) — mesma garantia.
do $$
declare
  v_org uuid; v_comp uuid; v_inseridas int;
begin
  select org, comp_a into v_org, v_comp from ctx;

  insert into invoice_jobs (organization_id, company_id, pagarme_charge_id,
                            pagarme_recipient_id, ambiente, valor_servicos)
  values (v_org, v_comp, 'ch_teste_inv', 're_abc123', 'producao', 100.00);

  with ins as (
    insert into invoice_jobs (organization_id, company_id, pagarme_charge_id,
                              pagarme_recipient_id, ambiente, valor_servicos)
    values (v_org, v_comp, 'ch_teste_inv', null, 'producao', 100.00)
    on conflict (dedup_scope) do nothing
    returning 1
  )
  select count(*) into v_inseridas from ins;

  perform pg_temp.check('webhook atrasado nao insere sobre o backfill', v_inseridas, 0);
end;
$$;

-- ── Cenário 3: split legítimo (1 cobrança -> 2 empresas) CONTINUA gerando 2 notas.
do $$
declare
  v_org uuid; v_a uuid; v_b uuid;
begin
  select org, comp_a, comp_b into v_org, v_a, v_b from ctx;

  insert into invoice_jobs (organization_id, company_id, pagarme_charge_id,
                            pagarme_recipient_id, ambiente, valor_servicos)
  values (v_org, v_a, 'ch_teste_split', 're_perna_a', 'producao', 60.00),
         (v_org, v_b, 'ch_teste_split', 're_perna_b', 'producao', 40.00);

  perform pg_temp.check(
    'split entre duas empresas gera duas notas',
    (select count(*)::int from invoice_jobs where pagarme_charge_id = 'ch_teste_split'),
    2);
end;
$$;

-- ── Cenário 4: a mesma venda em homologação e produção coexiste (cutover).
do $$
declare
  v_org uuid; v_comp uuid; v_n int;
begin
  select org, comp_a into v_org, v_comp from ctx;

  insert into invoice_jobs (organization_id, company_id, pagarme_charge_id,
                            pagarme_recipient_id, ambiente, valor_servicos)
  values (v_org, v_comp, 'ch_teste_amb', 're_x', 'homologacao', 10.00),
         (v_org, v_comp, 'ch_teste_amb', 're_x', 'producao', 10.00);

  select count(*)::int into v_n from invoice_jobs where pagarme_charge_id = 'ch_teste_amb';
  perform pg_temp.check('homologacao e producao da mesma venda coexistem', v_n, 2);
end;
$$;

-- ── Cenário 5: emissão manual (sem cobrança) não é fiscalizada.
do $$
declare
  v_org uuid; v_comp uuid; v_n int;
begin
  select org, comp_a into v_org, v_comp from ctx;

  insert into invoice_jobs (organization_id, company_id, pagarme_charge_id, ambiente, valor_servicos)
  values (v_org, v_comp, null, 'producao', 1.00),
         (v_org, v_comp, null, 'producao', 1.00);

  select count(*)::int into v_n
    from invoice_jobs where company_id = v_comp and pagarme_charge_id is null;
  perform pg_temp.check('duas notas manuais sem cobranca convivem', v_n, 2);
  perform pg_temp.check(
    'nota sem cobranca fica fora da fiscalizacao (dedup_scope nulo)',
    (select count(*)::int from invoice_jobs
      where company_id = v_comp and pagarme_charge_id is null and dedup_scope is not null),
    0);
end;
$$;

-- ── Cenário 6: correção da empresa na revisão recalcula a chave.
do $$
declare
  v_org uuid; v_a uuid; v_b uuid; v_id uuid; v_scope text;
begin
  select org, comp_a, comp_b into v_org, v_a, v_b from ctx;

  insert into invoice_jobs (organization_id, company_id, pagarme_charge_id,
                            pagarme_recipient_id, ambiente, valor_servicos)
  values (v_org, v_a, 'ch_teste_fix', null, 'producao', 50.00) returning id into v_id;

  update invoice_jobs set company_id = v_b where id = v_id;
  select dedup_scope into v_scope from invoice_jobs where id = v_id;

  perform pg_temp.check(
    'trocar a empresa recalcula a chave',
    v_scope,
    'ch_teste_fix|' || v_b::text || '|producao');
end;
$$;

select cenario, obtido from resultado order by n;

do $$
declare v_falhas int;
begin
  select count(*) into v_falhas from resultado where obtido <> 'ok';
  if v_falhas > 0 then
    raise exception '% cenario(s) falharam', v_falhas;
  end if;
  raise notice 'todos os cenarios passaram';
end;
$$;

rollback;
