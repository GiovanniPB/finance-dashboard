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
--   21 grupos  authorized + authorized   -> NADA é apagado aqui. Uma nota de cada
--                                           par tem de ser CANCELADA no Focus
--                                           (documento fiscal existe). Passo 4.
--   19 grupos  pending_review + pending  -> apaga a duplicata (nada emitido)
--    1 grupo   rejected + rejected       -> apaga a duplicata (nada emitido)
--    1 grupo   pending_review + authorized -> apaga a pendente, mantém a emitida
--
-- Critério de quem FICA (mesmo do relatório):
--   1. autorizada na frente de pendente/rejeitada (documento emitido manda);
--   2. entre iguais, a mais ANTIGA (menor created_at) — nas NFS-e é a de número
--      menor, emitida primeiro, que é a que o tomador recebeu antes.
--
-- ORDEM DE EXECUÇÃO (não inverta):
--   migration aplicada -> passo 1 (snapshot) -> 2 (apaga) -> 3 (adota a chave)
--   -> 4 (cancelamentos no Focus, fora daqui)
--
-- O passo 3 é o que devolve a proteção ao histórico: as linhas legadas nascem
-- com dedup_scope NULL (fora da fiscalização), então SEM ele um novo backfill
-- sobre julho/agosto voltaria a duplicar tudo.
--
--   psql "$DATABASE_URL" -f docs/integrations/sql/nfse-remediacao-duplicatas.sql
--
-- Roda inteiro em UMA transação. Sai em ROLLBACK por padrão: revise o relatório
-- e troque a última linha por COMMIT para efetivar.
-- =============================================================================
\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Passo 1 — snapshot. Tabela real (não temp): sobrevive à sessão e é a rede de
-- segurança para reverter o passo 2. Guarda a linha inteira em jsonb.
-- -----------------------------------------------------------------------------
create table if not exists public.invoice_jobs_backup_20260819 (
  id           uuid primary key,
  motivo       text not null,
  linha        jsonb not null,
  salvo_em     timestamptz not null default now()
);

alter table public.invoice_jobs_backup_20260819 enable row level security;
drop policy if exists "backup_20260819_super_admin" on public.invoice_jobs_backup_20260819;
create policy "backup_20260819_super_admin" on public.invoice_jobs_backup_20260819
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create temp table plano as
with grp as (
  select pagarme_charge_id, company_id, ambiente
  from public.invoice_jobs
  where pagarme_charge_id is not null
  group by 1, 2, 3
  having count(*) > 1
)
select
  j.id,
  j.status,
  j.document_type,
  j.numero_nfse,
  j.focus_ref,
  j.valor_servicos,
  j.pagarme_charge_id,
  j.company_id,
  j.ambiente,
  row_number() over (
    partition by j.pagarme_charge_id, j.company_id, j.ambiente
    order by
      case j.status when 'authorized' then 0 when 'pending_review' then 1 else 2 end,
      j.created_at
  ) as rn
from public.invoice_jobs j
join grp using (pagarme_charge_id, company_id, ambiente);

-- classifica cada linha do plano
create temp view plano_acao as
select p.*,
  case
    when p.rn = 1 then 'FICA'
    when p.status = 'authorized' then 'CANCELAR_NO_FOCUS'
    else 'APAGAR'
  end as acao
from plano p;

insert into public.invoice_jobs_backup_20260819 (id, motivo, linha)
select a.id, a.acao, to_jsonb(j)
from plano_acao a
join public.invoice_jobs j on j.id = a.id
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Passo 2 — apaga só duplicata SEM documento fiscal. A guarda dupla no WHERE é
-- deliberada: mesmo que o plano estivesse errado, nada com status 'authorized'
-- ou com número de nota pode ser apagado por este script.
-- -----------------------------------------------------------------------------
delete from public.invoice_jobs j
using plano_acao a
where a.id = j.id
  and a.acao = 'APAGAR'
  and j.status <> 'authorized'
  and j.numero_nfse is null
  and j.chave_nfse is null;

-- -----------------------------------------------------------------------------
-- Passo 3 — devolve a fiscalização ao histórico.
--
-- Toda linha com cobrança que hoje é única no trio (cobrança, empresa, ambiente)
-- adota a chave. Informar um valor não-nulo é o pedido de adoção; o trigger
-- ignora o valor e calcula a chave canônica (ver migration 20260819141651).
--
-- Sobram fora da fiscalização, de propósito:
--   * as 21 notas a cancelar (o par autorizado ainda existe, então adotar a
--     chave violaria o índice único). Elas entram depois, quando estiverem
--     'cancelled' — o passo 3 pode ser repetido à vontade, é idempotente;
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

-- -----------------------------------------------------------------------------
-- Relatório — revise ANTES de trocar o rollback por commit.
-- -----------------------------------------------------------------------------
select 'apagadas' as item, count(*) as valor
  from public.invoice_jobs_backup_20260819 where motivo = 'APAGAR'
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
select 'grupos duplicados restantes (deve ser 21: os pares autorizados)',
       count(*) from (
         select 1 from public.invoice_jobs
         where pagarme_charge_id is not null
         group by pagarme_charge_id, company_id, ambiente
         having count(*) > 1
       ) x;

-- as 21 notas a cancelar, com o número que FICA ao lado
select b.linha->>'numero_nfse' as cancelar_numero,
       b.linha->>'focus_ref'   as focus_ref,
       b.linha->>'tomador_nome' as tomador,
       b.linha->>'valor_servicos' as valor,
       (select k.numero_nfse from public.invoice_jobs k
         where k.pagarme_charge_id = b.linha->>'pagarme_charge_id'
           and k.company_id = (b.linha->>'company_id')::uuid
           and k.id <> b.id) as manter_numero
from public.invoice_jobs_backup_20260819 b
where b.motivo = 'CANCELAR_NO_FOCUS'
order by (b.linha->>'numero_nfse')::int;

-- Troque por COMMIT depois de revisar o relatório acima.
rollback;
