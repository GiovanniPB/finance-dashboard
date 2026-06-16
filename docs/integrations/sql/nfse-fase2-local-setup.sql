-- =============================================================================
-- Setup LOCAL para o end-to-end da Fase 2 (NFS-e) — NÃO é migration.
-- Roda contra a stack local (supabase db). Idempotente.
--
-- Mapeia os 2 recebedores REAIS do split (do payload de produção) para as
-- empresas, e habilita os settings fiscais mínimos para os jobs serem criados.
-- Campos fiscais (LC116, ISS, inscrição municipal) ficam a preencher quando
-- formos efetivamente emitir no Focus (Fase 3).
--
-- Recebedores (do charge.paid real):
--   re_cmnz0qnjs1wff0l9tu8zrhyg8 -> RCO TECNOLOGIA      (CNPJ 55481643000196)
--   re_cmgv7foko2q4a0l9tyv9if1mo -> JIMMY CARVALHO EDUC. (CNPJ 37383325000100)
--
-- ⚠️ Mapeamento por CNPJ funciona no REMOTO (CNPJs preenchidos via app). No
-- banco LOCAL as empresas do seed têm cnpj NULL — lá, mapeie a RCO pelo id
-- determinístico do seed ('00000000-0000-0000-0000-000000000013') ou preencha
-- os CNPJs locais antes de rodar este script.
-- Validado end-to-end local (16/06): charge.paid real -> 2 jobs (RCO queued /
-- Jimmy pending_review), R$882 cada, soma = R$1.764, idempotente.
-- =============================================================================

-- 1) Garante a empresa Jimmy Carvalho no banco local (no remoto foi via app).
insert into public.companies (organization_id, legal_name, trade_name, cnpj, tax_regime, sort_order)
select c.organization_id,
       'JIMMY CARVALHO EDUCACAO FINANCEIRA LTDA',
       'Jimmy Carvalho Educacao Financeira',
       '37383325000100',
       'lucro_presumido',
       10
from public.companies c
order by c.sort_order
limit 1
on conflict (cnpj) do nothing;

-- 2) Mapa recebedor pagar.me -> empresa (resolvendo company_id por CNPJ).
insert into public.pagarme_recipient_map (pagarme_recipient_id, company_id, ambiente)
select 're_cmnz0qnjs1wff0l9tu8zrhyg8', id, 'homologacao'
from public.companies where cnpj = '55481643000196'
on conflict (pagarme_recipient_id) do nothing;

insert into public.pagarme_recipient_map (pagarme_recipient_id, company_id, ambiente)
select 're_cmgv7foko2q4a0l9tyv9if1mo', id, 'homologacao'
from public.companies where cnpj = '37383325000100'
on conflict (pagarme_recipient_id) do nothing;

-- 3) Settings fiscais mínimos (enabled) — modos diferentes para exercitar a esteira.
--    RCO: automatic (jobs vão para 'queued'); Jimmy: manual (vão para 'pending_review').
insert into public.fiscal_company_settings (company_id, ambiente, emission_mode, enabled)
select id, 'homologacao', 'automatic', true
from public.companies where cnpj = '55481643000196'
on conflict (company_id) do nothing;

insert into public.fiscal_company_settings (company_id, ambiente, emission_mode, enabled)
select id, 'homologacao', 'manual', true
from public.companies where cnpj = '37383325000100'
on conflict (company_id) do nothing;
