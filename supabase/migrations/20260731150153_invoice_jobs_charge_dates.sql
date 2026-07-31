-- NFS-e: gravar a data da compra e do pagamento da cobrança.
--
-- A nota só tinha `created_at` (quando entrou na fila — na carga retroativa, a
-- hora em que o operador clicou "Carregar") e `emitida_em` (a autorização na
-- prefeitura). A data em que o cliente comprou e pagou — o fato econômico que
-- gera a nota — chegava no payload do pagar.me (`charge.created_at` /
-- `charge.paid_at`) e era descartada no parsing, então não existia no banco.
--
-- Duas colunas porque as datas divergem: em cartão a compra e o pagamento
-- ficam a segundos de distância, mas em boleto/pix podem estar a dias.

alter table public.invoice_jobs
  add column if not exists charge_created_at timestamptz,
  add column if not exists paid_at timestamptz;

comment on column public.invoice_jobs.charge_created_at is
  'Quando a cobrança foi criada no pagar.me (data da compra).';
comment on column public.invoice_jobs.paid_at is
  'Quando a cobrança foi paga no pagar.me (o charge.paid que gera a nota).';

-- a fila passa a ser filtrada e ordenada por data de pagamento
create index if not exists idx_invoice_jobs_paid_at
  on public.invoice_jobs (paid_at desc nulls last);

-- ===========================================================
-- Backfill das notas já existentes vindas de webhook
-- ===========================================================
-- O payload bruto do evento está em `sales_events`; o vínculo é a procedência
-- gravada em `metadata.sourceEventId` (o id do webhook). Aproveita para
-- carimbar `sales_event_id`, que o webhook tinha em mãos e nunca preencheu.
--
-- As datas do pagar.me vêm ISO **sem offset** no payload real
-- ("2026-07-31T14:32:54") e às vezes com "Z". Sem offset são UTC (documentação
-- do pagar.me), e é preciso dizer isso explicitamente: um cast direto para
-- timestamptz interpretaria a string no TimeZone da sessão, deslocando a data
-- em até um dia nas pontas.
with src as (
  select
    j.id                                  as job_id,
    se.id                                 as event_id,
    se.payload -> 'data' ->> 'created_at' as created_txt,
    se.payload -> 'data' ->> 'paid_at'    as paid_txt
  from public.invoice_jobs j
  join public.sales_events se
    on se.provider = 'pagarme'
   and se.event_id = j.metadata ->> 'sourceEventId'
  where j.paid_at is null
     or j.charge_created_at is null
)
update public.invoice_jobs j
set
  sales_event_id = coalesce(j.sales_event_id, src.event_id),
  charge_created_at = case
    when src.created_txt is null then j.charge_created_at
    when src.created_txt ~ '(Z|[+-][0-9]{2}:?[0-9]{2})$' then src.created_txt::timestamptz
    else (src.created_txt::timestamp at time zone 'UTC')
  end,
  paid_at = case
    when src.paid_txt is null then j.paid_at
    when src.paid_txt ~ '(Z|[+-][0-9]{2}:?[0-9]{2})$' then src.paid_txt::timestamptz
    else (src.paid_txt::timestamp at time zone 'UTC')
  end
from src
where src.job_id = j.id;

-- ===========================================================
-- Reemissão em produção passa a carregar as datas da venda
-- ===========================================================
-- `reemit_authorized_to_producao` lista as colunas de DEFINIÇÃO uma a uma, então
-- o clone nasceria sem as datas novas — e é a MESMA venda: a compra e o
-- pagamento não mudam por reemitir em produção. Idem `sales_event_id`, a
-- procedência do evento. O resto do contrato da função continua igual
-- (ver 20260710134701_nfse_producao_cutover.sql).
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
  on conflict (pagarme_charge_id, pagarme_recipient_id, ambiente) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reemit_authorized_to_producao(uuid) from public, anon;
grant execute on function public.reemit_authorized_to_producao(uuid) to authenticated;
