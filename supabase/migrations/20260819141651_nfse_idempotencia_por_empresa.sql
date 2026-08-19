-- =============================================================================
-- NFS-e — a idempotência passa a ser (cobrança, EMPRESA, ambiente)
--
-- O QUE ACONTECEU (21 NFS-e duplicadas em produção, R$ 12.000 em dobro)
--
-- A chave era `(pagarme_charge_id, pagarme_recipient_id, ambiente)`. O problema
-- é que `pagarme_recipient_id` NÃO é um fato da venda: é um fato de qual leitura
-- do split o escritor conseguiu no instante em que rodou.
--
--   * `payable` no pagar.me é ASSÍNCRONO. O webhook roda segundos após o
--     `charge.paid`, consulta `/payables?charge_id=` e recebe vazio; cai no
--     `split[]` do payload, que nessas cobranças também vem vazio. Sem split,
--     `explodeChargePaid` gera UM job da empresa dona da conta com
--     `pagarme_recipient_id = NULL` e valor integral.
--   * O backfill lê a MESMA cobrança horas depois, `/payables` já responde, e
--     grava o mesmo job com `pagarme_recipient_id = 're_...'`.
--   * `(ch_x, NULL, producao)` e `(ch_x, re_y, producao)` são chaves DIFERENTES.
--     O índice único nunca dispara e o `on conflict do nothing` passa liso.
--
-- O `nulls not distinct` da migration 20260708142505 cobriu só NULL-vs-NULL —
-- o caso que estourou é NULL-vs-valor, que ele não cobre por definição.
--
-- O CONSERTO
--
-- A unidade de idempotência real é "uma nota por EMPRESA, por cobrança, por
-- ambiente" — e `company_id` é estável entre os dois escritores: com split ele
-- vem do recebedor mapeado, sem split vem da empresa dona da conta; nos 42 casos
-- duplicados do remoto as duas linhas sempre tinham o MESMO company_id.
-- Verificado no remoto: nenhum grupo (cobrança, empresa, ambiente) tem dois
-- recebedores distintos, logo a chave nova não funde nenhum split legítimo.
--
-- POR QUE UMA COLUNA E NÃO UM ÍNDICE DIRETO EM (charge, company_id, ambiente)
--
--   1. já existem 42 grupos duplicados no remoto — 21 deles com AMBAS as notas
--      autorizadas na prefeitura. Criar índice único sobre as colunas falharia,
--      e apagar linha de nota fiscal emitida é decisão fiscal, não de migration;
--   2. o `on conflict` do PostgREST/supabase-js não mira índice parcial
--      (ver 20260602153319), então "índice pleno menos o legado" não é opção.
--
-- Uma coluna preenchida por trigger só no INSERT resolve os dois: as linhas
-- LEGADAS ficam com `dedup_scope = NULL` (não fiscalizadas, preservadas para a
-- reconciliação fiscal manual) e toda linha NOVA nasce com a chave calculada e
-- fiscalizada pelo índice único. NULLs são distintos aqui — de propósito.
-- =============================================================================

alter table public.invoice_jobs add column dedup_scope text;

comment on column public.invoice_jobs.dedup_scope is
  'Chave de idempotência (cobrança|empresa|ambiente), preenchida por trigger no '
  'INSERT. NULL = linha anterior à migration 20260819141651 (legado duplicado, '
  'fora da fiscalização) ou job sem cobrança do pagar.me (emissão manual).';

-- -----------------------------------------------------------------------------
-- Cálculo da chave. Regra única: `dedup_scope` é SEMPRE calculado das colunas,
-- nunca aceito do cliente. NULL só permanece em dois casos:
--   * job sem `pagarme_charge_id` (emissão manual — não há o que deduplicar);
--   * linha LEGADA (dedup_scope já era NULL) num UPDATE que não pediu a adoção.
--
-- "Pedir a adoção" = informar qualquer valor não-nulo em dedup_scope no UPDATE;
-- o valor informado é ignorado e a chave canônica é recalculada. É por essa
-- porta que a remediação das duplicatas históricas devolve a fiscalização às
-- linhas que sobrarem (ver docs/integrations/sql/nfse-remediacao-duplicatas.sql).
-- Consequência boa: um UPDATE comum numa linha já fiscalizada recalcula a chave,
-- então corrigir a empresa na revisão mantém a linha coerente.
-- -----------------------------------------------------------------------------
create or replace function public.invoice_jobs_set_dedup_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- legado que não pediu adoção continua fora da fiscalização
  if tg_op = 'UPDATE' and old.dedup_scope is null and new.dedup_scope is null then
    return new;
  end if;

  if new.pagarme_charge_id is null then
    new.dedup_scope := null;
  else
    new.dedup_scope :=
      new.pagarme_charge_id || '|' || new.company_id::text || '|' || new.ambiente::text;
  end if;

  return new;
end;
$$;

create trigger trg_invoice_jobs_dedup_scope
  before insert or update on public.invoice_jobs
  for each row execute function public.invoice_jobs_set_dedup_scope();

-- índice PLENO sobre coluna simples: é o que o `on conflict` do supabase-js mira
create unique index uq_invoice_jobs_dedup_scope
  on public.invoice_jobs (dedup_scope);

-- -----------------------------------------------------------------------------
-- O índice antigo sai. Duas razões:
--   1. virou REDUNDANTE: `pagarme_recipients.pagarme_recipient_id` é unique, logo
--      um recebedor pertence a uma empresa só — sempre que a chave antiga
--      colidiria, a nova também colide. A nova é estritamente mais forte;
--   2. era ATIVAMENTE NOCIVO no caso sem cobrança: com `nulls not distinct`,
--      (NULL, NULL, ambiente) admitia UMA única nota sem `charge_id` por ambiente
--      em toda a tabela — emissão manual ficava barrada a partir da segunda nota.
--      (Zero linhas sem cobrança hoje no remoto, então o drop não libera nada que
--      já estivesse duplicado.)
-- -----------------------------------------------------------------------------
drop index if exists public.uq_invoice_jobs_charge_recipient;

-- -----------------------------------------------------------------------------
-- `reemit_authorized_to_producao` passa a inferir pela chave nova. O clone de
-- produção não colide com a origem de homologação porque `ambiente` compõe a
-- chave; clicar duas vezes continua não duplicando.
-- -----------------------------------------------------------------------------
create or replace function public.reemit_authorized_to_producao(p_account_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.invoice_jobs (
    organization_id, company_id, document_type, pagarme_account_id,
    pagarme_charge_id, pagarme_recipient_id, ambiente, status,
    valor_servicos, tomador_documento, tomador_nome, tomador_email, tomador_endereco,
    item_lista_servico, codigo_tributario_municipio, aliquota_iss, parametros, metadata,
    charge_created_at, paid_at, sales_event_id
  )
  select
    src.organization_id, src.company_id, src.document_type, src.pagarme_account_id,
    src.pagarme_charge_id, src.pagarme_recipient_id,
    'producao'::nfse_ambiente, 'pending_review'::invoice_job_status,
    src.valor_servicos, src.tomador_documento, src.tomador_nome, src.tomador_email,
    src.tomador_endereco, src.item_lista_servico, src.codigo_tributario_municipio,
    src.aliquota_iss, src.parametros,
    (coalesce(src.metadata, '{}'::jsonb) - 'backfillRunId')
      || jsonb_build_object('reemittedFromJobId', src.id::text),
    src.charge_created_at, src.paid_at, src.sales_event_id
  from public.invoice_jobs src
  where src.pagarme_account_id = p_account_id
    and src.ambiente = 'homologacao'
    and src.status = 'authorized'
  on conflict (dedup_scope) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reemit_authorized_to_producao(uuid) from public, anon;
grant execute on function public.reemit_authorized_to_producao(uuid) to authenticated;
