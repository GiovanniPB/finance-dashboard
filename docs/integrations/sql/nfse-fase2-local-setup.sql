-- =============================================================================
-- Setup LOCAL do end-to-end NFS-e (multi-conta) — NÃO é migration.
-- Roda contra a stack local (supabase db). Idempotente.
--
-- Modela o cenário real: 2 contas pagar.me DISTINTAS.
--   conta-jimmy : dona = Jimmy; cobranças COM split (Jimmy + RCO como recebedor)
--   conta-rco   : dona = RCO;   cobranças exclusivas da RCO (podem vir SEM split)
--
-- Recebedores (do charge.paid real, dentro da conta da Jimmy):
--   re_cmgv7foko2q4a0l9tyv9if1mo -> JIMMY CARVALHO EDUC. (CNPJ 37383325000100)
--   re_cmnz0qnjs1wff0l9tu8zrhyg8 -> RCO TECNOLOGIA       (CNPJ 55481643000196)
--
-- O webhook é endereçado por ?account=<slug> e valida o segredo PRÓPRIO da
-- conta (Vault, via RPC get_pagarme_webhook_secret). Aqui criamos um segredo
-- local de teste para a conta-jimmy.
--
-- ⚠️ No banco LOCAL as empresas do seed têm cnpj NULL — este script garante a
-- Jimmy e assume que a RCO já existe com CNPJ. Ajuste os CNPJs locais se preciso.
-- =============================================================================

-- 0) LOCAL: o seed da RCO ('…0013') tem cnpj NULL; define o CNPJ real para os
--    joins por CNPJ abaixo funcionarem. (No remoto o CNPJ já vem do app.)
update public.companies set cnpj = '55481643000196'
where id = '00000000-0000-0000-0000-000000000013' and cnpj is null;

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

-- 2) Segredo de webhook local da conta-jimmy (Vault). Use este valor no ?secret=.
select vault.create_secret('local-webhook-jimmy', 'pagarme_webhook_jimmy', 'Webhook pagar.me - conta Jimmy (local)')
where not exists (select 1 from vault.secrets where name = 'pagarme_webhook_jimmy');

-- 3) Contas pagar.me (uma por conexão), com a empresa dona.
insert into public.pagarme_accounts (organization_id, slug, label, owner_company_id, webhook_secret_ref, ambiente)
select co.organization_id, 'conta-jimmy', 'Jimmy Carvalho', co.id, 'pagarme_webhook_jimmy', 'homologacao'
from public.companies co where co.cnpj = '37383325000100'
on conflict (slug) do nothing;

insert into public.pagarme_accounts (organization_id, slug, label, owner_company_id, ambiente)
select co.organization_id, 'conta-rco', 'RCO Tecnologia', co.id, 'homologacao'
from public.companies co where co.cnpj = '55481643000196'
on conflict (slug) do nothing;

-- 4) Mapa recebedor -> empresa, ESCOPADO à conta-jimmy (split Jimmy + RCO).
insert into public.pagarme_recipient_map (pagarme_account_id, pagarme_recipient_id, company_id, ambiente)
select a.id, 're_cmgv7foko2q4a0l9tyv9if1mo', co.id, 'homologacao'
from public.pagarme_accounts a
join public.companies co on co.cnpj = '37383325000100'
where a.slug = 'conta-jimmy'
on conflict (pagarme_account_id, pagarme_recipient_id) do nothing;

insert into public.pagarme_recipient_map (pagarme_account_id, pagarme_recipient_id, company_id, ambiente)
select a.id, 're_cmnz0qnjs1wff0l9tu8zrhyg8', co.id, 'homologacao'
from public.pagarme_accounts a
join public.companies co on co.cnpj = '55481643000196'
where a.slug = 'conta-jimmy'
on conflict (pagarme_account_id, pagarme_recipient_id) do nothing;

-- 5) Settings fiscais mínimos (enabled) — modos diferentes para exercitar a esteira.
--    RCO: automatic (jobs -> 'queued'); Jimmy: manual (jobs -> 'pending_review').
insert into public.fiscal_company_settings (company_id, ambiente, emission_mode, enabled)
select id, 'homologacao', 'automatic', true
from public.companies where cnpj = '55481643000196'
on conflict (company_id) do nothing;

insert into public.fiscal_company_settings (company_id, ambiente, emission_mode, enabled)
select id, 'homologacao', 'manual', true
from public.companies where cnpj = '37383325000100'
on conflict (company_id) do nothing;

-- Teste local:
--   POST .../functions/v1/pagarme-webhook?account=conta-jimmy&secret=local-webhook-jimmy
