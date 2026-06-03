-- Troca o índice único PARCIAL (charge×recipient) por um PLENO.
-- Motivo: o `upsert ... on_conflict` do PostgREST/supabase-js não consegue
-- mirar um índice parcial (não expressa o predicado WHERE). Um índice único
-- pleno sobre (pagarme_charge_id, pagarme_recipient_id) resolve isso e mantém
-- o comportamento desejado: NULLs são distintos (jobs sem charge/recipient não
-- colidem), e o par (charge, recipient) continua único -> idempotência.

drop index if exists public.uq_invoice_jobs_charge_recipient;

create unique index uq_invoice_jobs_charge_recipient
  on public.invoice_jobs (pagarme_charge_id, pagarme_recipient_id);
