-- =============================================================================
-- NFS-e/NF-e — data de emissão persistida (para a contabilidade)
--
-- O webhook de status do Focus NÃO devolve `data_emissao`; nós é que carimbamos
-- a data ao emitir (worker: `data_emissao = now()`). Persistimos esse valor em
-- `emitida_em` no momento da submissão, para o export contábil ter a data real
-- da emissão do documento (estável — não se move em reprocessos, ao contrário de
-- `updated_at`).
-- =============================================================================
alter table public.invoice_jobs
  add column if not exists emitida_em timestamptz;

comment on column public.invoice_jobs.emitida_em is
  'Data/hora de emissão carimbada no documento (data_emissao enviada ao Focus).';
