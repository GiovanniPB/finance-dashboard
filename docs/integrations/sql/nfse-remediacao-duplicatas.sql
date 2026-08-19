-- =============================================================================
-- NFS-e/NF-e — remediação das duplicatas históricas (bug da chave por recebedor)
--
-- Contexto: até a migration 20260819141651 a idempotência era
-- (charge, recipient, ambiente). Como o webhook grava recipient NULL quando
-- `/payables` ainda não respondeu e o backfill grava `re_...` depois, a mesma
-- venda entrou duas vezes. Diagnóstico completo no commit da migration.
--
-- Este script NÃO é migration: mexe em DADOS de negócio, é de uso único, e
-- roda DEPOIS da migration estar aplicada no ambiente.
--
-- Inventário no remoto em 19/08/2026 — 42 grupos, todos com exatamente 2 linhas,
-- sempre mesmo valor, mesmo tomador e mesmo document_type:
--
--   21 grupos  authorized + authorized     -> NADA é apagado aqui. Uma nota de
--                                             cada par tem de ser CANCELADA no
--                                             Focus (documento fiscal existe).
--   19 grupos  pending_review + pending    -> apaga a duplicata (nada emitido)
--    1 grupo   rejected + rejected         -> apaga a duplicata (nada emitido)
--    1 grupo   pending_review + authorized -> apaga a pendente, mantém a emitida
--
-- ORDEM DE EXECUÇÃO (não inverta):
--   migration aplicada -> passo 1 (snapshot+plano) -> 2 (apaga) -> 3 (adota a
--   chave) -> 4 (relatório) -> cancelamentos no Focus, via `nfse-cancel`
--
-- A tabela de backup É o plano: guarda a linha inteira em jsonb e o motivo
-- (FICA / APAGAR / CANCELAR_NO_FOCUS) decidido pela window function. Assim os
-- passos não dependem de tabela temporária e podem rodar por psql OU pela API,
-- sem que o registro no repo divirja do que executou.
--
--   psql "$DATABASE_URL" -f docs/integrations/sql/nfse-remediacao-duplicatas.sql
--
-- Passos 1–3 rodam em UMA transação. O relatório do passo 4 é só leitura e pode
-- ser repetido à vontade.
-- =============================================================================
\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Passo 1 — snapshot E plano na mesma tabela. Tabela real (não temp): sobrevive
-- à sessão e é a rede de segurança para reverter o passo 2.
--
-- Quem FICA em cada grupo:
--   1. autorizada na frente de pendente/rejeitada (documento emitido manda);
--   2. entre iguais, a mais ANTIGA — nas NFS-e é a de número menor, emitida
--      primeiro, que é a que o tomador recebeu antes.
-- -----------------------------------------------------------------------------
create table if not exists public.invoice_jobs_backup_20260819 (
  id       uuid primary key,
  motivo   text not null,
  linha    jsonb not null,
  salvo_em timestamptz not null default now()
);

alter table public.invoice_jobs_backup_20260819 enable row level security;
drop policy if exists "backup_20260819_super_admin" on public.invoice_jobs_backup_20260819;
create policy "backup_20260819_super_admin" on public.invoice_jobs_backup_20260819
  for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

insert into public.invoice_jobs_backup_20260819 (id, motivo, linha)
with grp as (
  select pagarme_charge_id, company_id, ambiente
  from public.invoice_jobs
  where pagarme_charge_id is not null
  group by 1, 2, 3
  having count(*) > 1
),
ranked as (
  select j.id, j.status,
         row_number() over (
           partition by j.pagarme_charge_id, j.company_id, j.ambiente
           order by
             case j.status when 'authorized' then 0 when 'pending_review' then 1 else 2 end,
             j.created_at
         ) rn
  from public.invoice_jobs j
  join grp using (pagarme_charge_id, company_id, ambiente)
)
select r.id,
       case
         when r.rn = 1 then 'FICA'
         when r.status = 'authorized' then 'CANCELAR_NO_FOCUS'
         else 'APAGAR'
       end,
       to_jsonb(j)
from ranked r
join public.invoice_jobs j on j.id = r.id
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Passo 2 — apaga só duplicata SEM documento fiscal. As três guardas extras no
-- WHERE são deliberadas: mesmo que o plano estivesse errado, nada com status
-- 'authorized', com número de nota ou com chave pode ser apagado por este script.
-- -----------------------------------------------------------------------------
delete from public.invoice_jobs j
using public.invoice_jobs_backup_20260819 b
where b.id = j.id
  and b.motivo = 'APAGAR'
  and j.status <> 'authorized'
  and j.numero_nfse is null
  and j.chave_nfse is null;

-- -----------------------------------------------------------------------------
-- Passo 3 — devolve a fiscalização ao histórico.
--
-- Toda linha com cobrança que hoje é única no trio (cobrança, empresa, ambiente)
-- adota a chave. Informar um valor não-nulo é o PEDIDO de adoção; o trigger
-- ignora o valor e calcula a chave canônica (ver migration 20260819141651).
--
-- Sem este passo a correção só valeria para linhas novas: as ~4.000 linhas
-- legadas nascem com dedup_scope NULL, e um novo backfill sobre julho/agosto
-- voltaria a duplicar tudo.
--
-- Ficam fora de propósito:
--   * as 21 notas a cancelar (o par autorizado ainda existe, então adotar a
--     chave violaria o índice único). Entram quando estiverem 'cancelled' —
--     este passo é idempotente e pode ser repetido;
--   * jobs sem pagarme_charge_id (emissão manual).
-- -----------------------------------------------------------------------------
update public.invoice_jobs j
set dedup_scope = 'adotar'
where j.pagarme_charge_id is not null
  and j.dedup_scope is null
  and not exists (
    select 1 from public.invoice_jobs k
    where k.pagarme_charge_id = j.pagarme_charge_id
      and k.company_id = j.company_id
      and k.ambiente = j.ambiente
      and k.id <> j.id
  );

commit;

-- -----------------------------------------------------------------------------
-- Passo 4 — relatório (só leitura, repetível).
-- -----------------------------------------------------------------------------
select 'apagadas' as item, count(*) as valor
  from public.invoice_jobs_backup_20260819 b
  where b.motivo = 'APAGAR'
    and not exists (select 1 from public.invoice_jobs j where j.id = b.id)
union all
select 'a cancelar no focus', count(*)
  from public.invoice_jobs_backup_20260819 where motivo = 'CANCELAR_NO_FOCUS'
union all
select 'linhas fiscalizadas (dedup_scope preenchido)', count(*)
  from public.invoice_jobs where dedup_scope is not null
union all
select 'linhas com cobranca ainda fora da fiscalizacao', count(*)
  from public.invoice_jobs where pagarme_charge_id is not null and dedup_scope is null
union all
select 'grupos duplicados restantes (esperado: os pares autorizados)', count(*)
  from (
    select 1 from public.invoice_jobs
    where pagarme_charge_id is not null
    group by pagarme_charge_id, company_id, ambiente
    having count(*) > 1
  ) x;

-- as notas a cancelar, com o número que FICA ao lado
select b.linha->>'numero_nfse'    as cancelar_numero,
       b.linha->>'focus_ref'      as focus_ref,
       b.linha->>'tomador_nome'   as tomador,
       b.linha->>'valor_servicos' as valor,
       (select k.numero_nfse from public.invoice_jobs k
         where k.pagarme_charge_id = b.linha->>'pagarme_charge_id'
           and k.company_id = (b.linha->>'company_id')::uuid
           and k.id <> b.id) as manter_numero
from public.invoice_jobs_backup_20260819 b
where b.motivo = 'CANCELAR_NO_FOCUS'
order by (b.linha->>'numero_nfse')::int;
