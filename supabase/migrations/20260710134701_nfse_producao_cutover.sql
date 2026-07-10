-- =============================================================================
-- NFS-e/NF-e — cutover para produção
--
-- Notas de homologação são documentos de TESTE (sem valor fiscal) e NÃO podem
-- ser convertidas em produção: é preciso EMITIR notas NOVAS no ambiente de
-- produção para as mesmas vendas. Duas mudanças habilitam isso:
--   1. `ambiente` entra na chave de idempotência — assim a nota de produção de
--      uma cobrança coexiste com a de homologação (a dedup passa a ser POR
--      ambiente: continua impedindo emitir 2x em produção);
--   2. RPC que clona as notas AUTORIZADAS de homologação de uma conexão em
--      novos jobs `producao` + `pending_review` (nada é emitido — barreira de
--      revisão antes de gerar documento fiscal de verdade).
-- Doc: docs/integrations/nfse-backfill-plan.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Idempotência por (charge, recipient, AMBIENTE)
--
-- Antes: (charge, recipient) — bloquearia criar a versão de produção de uma
-- cobrança que já tem nota de homologação. Incluindo `ambiente`, os dois
-- coexistem; o webhook e o backfill precisam refletir isso no `onConflict`.
-- Pré-condição de recriação: não há duplicatas — hoje tudo é 'homologacao' e
-- (charge, recipient) já era único, logo (charge, recipient, ambiente) também é.
-- -----------------------------------------------------------------------------
drop index if exists public.uq_invoice_jobs_charge_recipient;

create unique index uq_invoice_jobs_charge_recipient
  on public.invoice_jobs (pagarme_charge_id, pagarme_recipient_id, ambiente)
  nulls not distinct;

-- -----------------------------------------------------------------------------
-- 2. Reemissão em produção — clona as notas AUTORIZADAS de homologação de uma
-- conexão para novos jobs de produção (pending_review). Idempotente: ON CONFLICT
-- DO NOTHING pela nova chave, então clicar de novo não duplica.
--
-- SECURITY INVOKER: respeita a RLS de invoice_jobs (o autor precisa de acesso à
-- empresa). Copia só os campos de DEFINIÇÃO; os de RESULTADO (focus_ref, número,
-- chave, XML, erros, tentativas, aprovação) nascem zerados/default. `focus_ref`
-- ganha um novo valor pelo default da coluna. Remove `backfillRunId` do metadata
-- para o clone de produção não ser apagado ao excluir a carga de homologação.
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
    item_lista_servico, codigo_tributario_municipio, aliquota_iss, parametros, metadata
  )
  select
    src.organization_id, src.company_id, src.document_type, src.pagarme_account_id,
    src.pagarme_charge_id, src.pagarme_recipient_id,
    'producao'::nfse_ambiente, 'pending_review'::invoice_job_status,
    src.valor_servicos, src.tomador_documento, src.tomador_nome, src.tomador_email,
    src.tomador_endereco, src.item_lista_servico, src.codigo_tributario_municipio,
    src.aliquota_iss, src.parametros,
    (coalesce(src.metadata, '{}'::jsonb) - 'backfillRunId')
      || jsonb_build_object('reemittedFromJobId', src.id::text)
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
