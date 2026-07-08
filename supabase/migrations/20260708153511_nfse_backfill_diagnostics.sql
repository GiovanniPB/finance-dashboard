-- =============================================================================
-- NFS-e backfill — observabilidade do run
-- Doc: docs/integrations/nfse-backfill-plan.md
--
-- A simulação dizia "0 notas previstas" sem explicar por quê (recebedores não
-- mapeados caíam em skip invisível). Estas colunas dão visibilidade:
--   - total_charges: paging.total do pagar.me na 1ª página -> permite mostrar %;
--   - diagnostics: histograma de skips por motivo, recebedores não-mapeados
--     vistos (para o operador saber o que mapear) e erros por página.
-- =============================================================================

alter table public.invoice_backfill_runs
  add column total_charges int,
  add column diagnostics jsonb not null default '{}'::jsonb;

comment on column public.invoice_backfill_runs.total_charges is
  'paging.total do GET /charges (janela) — base do % de progresso.';
comment on column public.invoice_backfill_runs.diagnostics is
  'Diagnóstico do run: { skipReasons:{motivo:n}, unmappedRecipients:{re_id:{count,reais}}, pageErrors:[] }.';
