-- =============================================================================
-- Seed LOCAL (db:reset) — configuração fiscal real do grupo OTM para validar a
-- esteira NFS-e/NF-e de ponta a ponta no ambiente local.
--
-- Escopo: dados de NEGÓCIO do próprio grupo (CNPJ/IE/IM/recebedores próprios +
-- códigos fiscais públicos). NÃO contém segredos do Vault (token do Focus,
-- secret key do pagar.me, segredo de webhook) nem PII de cliente — esses são
-- configurados pela UI (RPCs SECURITY DEFINER → Vault). Sem eles a config fica
-- pronta, mas a emissão real depende do operador cadastrar os tokens.
--
-- Idempotência: roda em banco recriado do zero (db:reset). Inserts com conflito
-- protegido por segurança.
-- =============================================================================

-- IDs fixos (referência cruzada no seed)
--   org           00000000-0000-0000-0000-000000000001  (OTM Group — já existe)
--   RCO Tecnologia 00000000-0000-0000-0000-000000000013 (já existe)
--   Jimmy Carvalho 00000000-0000-0000-0000-000000000014 (criado aqui)
--   conta pagar.me 00000000-0000-0000-0000-0000000000a0

-- -----------------------------------------------------------------------------
-- 1. Empresas — CNPJ da RCO + cadastro da Jimmy (emissora de NF-e/produto)
-- -----------------------------------------------------------------------------
update public.companies
set cnpj = '55481643000196'
where id = '00000000-0000-0000-0000-000000000013' and cnpj is null;

insert into public.companies (id, organization_id, legal_name, trade_name, cnpj, tax_regime, is_holding, sort_order)
values (
  '00000000-0000-0000-0000-000000000014',
  '00000000-0000-0000-0000-000000000001',
  'Jimmy Carvalho Educacao Financeira LTDA',
  'Jimmy Carvalho',
  '37383325000100',
  'lucro_presumido',
  false,
  4
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Config fiscal — Jimmy = NF-e (produto/livro, imunidade de ICMS)
--    Defaults de produto vão em parametros.nfe (o worker consome no fallback).
-- -----------------------------------------------------------------------------
insert into public.fiscal_company_settings (
  company_id, document_type, ambiente, emission_mode, enabled,
  inscricao_estadual, regime_tributario, serie, emitente_endereco, parametros
)
values (
  '00000000-0000-0000-0000-000000000014',
  'nfe', 'homologacao', 'automatic', true,
  '206764802112', 3, '101',
  jsonb_build_object(
    'logradouro', 'Alameda Rio Negro',
    'numero', '500',
    'complemento', 'ANEXO 54 Torre B Sala 501 a 508 Andar 5',
    'bairro', 'Alphaville Centro Industrial e Empresarial',
    'municipio', 'Barueri',
    'uf', 'SP',
    'cep', '06454000'
  ),
  jsonb_build_object('nfe', jsonb_build_object(
    'codigoProduto', '899',
    'descricao', 'Curso e Plataforma RCO Dash',
    'ncm', '49019900',
    'cest', '2806400',
    'cfopInterno', '5101',
    'cfopInterestadual', '6107',
    'origem', 0,
    'cstIcms', '41',
    'codigoBeneficioFiscal', 'SP070130',
    'pisCst', '01',
    'pisAliquota', 0.65,
    'cofinsCst', '01',
    'cofinsAliquota', 3.00,
    'infoComplementar', 'PRODUTO COM IMUNIDADE TRIBUTARIA CONFORME ALINEA D, DO INCISO VI, DO ARTIGO 150 DA CF/88. IPI isento conforme Cap. III secao I do decreto n 7.212/2010. Resposta a consulta RC 17.474 - Manual ISBN Pag.24'
  ))
)
on conflict (company_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Config fiscal — RCO = NFS-e (serviço, Barueri, Simples Nacional)
--    Código de serviço do layout 2026 (080201220) + códigos do Simples Barueri.
-- -----------------------------------------------------------------------------
insert into public.fiscal_company_settings (
  company_id, document_type, ambiente, emission_mode, enabled,
  inscricao_municipal, municipio_ibge, item_lista_servico, aliquota_iss,
  iss_retido, optante_simples, codigo_opcao_simples_nacional,
  regime_tributario_simples_nacional, discriminacao
)
values (
  '00000000-0000-0000-0000-000000000013',
  'nfse', 'homologacao', 'automatic', true,
  '5BF7555', '3505708', '080201220', 0.0200,
  false, true, 3, 1, 'Research RCO'
)
on conflict (company_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Conta pagar.me (Jimmy) — dona = Jimmy; recebedores: Jimmy + RCO (split)
--    Segredos (webhook/api) ficam null → cadastrados pela UI (Vault).
-- -----------------------------------------------------------------------------
insert into public.pagarme_accounts (id, organization_id, slug, label, owner_company_id, ambiente, active)
values (
  '00000000-0000-0000-0000-0000000000a0',
  '00000000-0000-0000-0000-000000000001',
  'jimmy-carvalho', 'Jimmy Carvalho',
  '00000000-0000-0000-0000-000000000014',
  'homologacao', true
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Mapa de recebedores do split → empresa (escopado à conta)
-- -----------------------------------------------------------------------------
insert into public.pagarme_recipient_map (pagarme_account_id, pagarme_recipient_id, company_id, ambiente, active)
values
  ('00000000-0000-0000-0000-0000000000a0', 're_cmgv7foko2q4a0l9tyv9if1mo', '00000000-0000-0000-0000-000000000014', 'homologacao', true),
  ('00000000-0000-0000-0000-0000000000a0', 're_cmnz0qnjs1wff0l9tu8zrhyg8', '00000000-0000-0000-0000-000000000013', 'homologacao', true)
on conflict (pagarme_account_id, pagarme_recipient_id) do nothing;
