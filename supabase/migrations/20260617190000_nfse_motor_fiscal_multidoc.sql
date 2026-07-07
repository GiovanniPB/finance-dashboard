-- =============================================================================
-- Motor fiscal configurável multi-documento (NF-e produto + NFS-e serviço)
--
-- Generaliza a esteira (hoje NFS-e-only) para roteamento por TIPO DE DOCUMENTO,
-- vindo de configuração por empresa — não hardcoded. Aditivo + JSONB: novas
-- colunas com default, sem quebrar dados/linhas existentes (default 'nfse'
-- preserva o comportamento atual).
--
-- Regras de negócio que esta migration habilita (confirmadas em nota real):
--   · NF-e (produto/livro): NCM, CFOP interno/interestadual, CST ICMS 41 +
--     cBenef, PIS/COFINS TRIBUTADOS, IE, regime, série própria.
--   · NFS-e (serviço, Barueri): códigos do Simples Nacional exigidos pela PMB
--     (codigo_opcao_simples_nacional, regime_tributario_simples_nacional).
-- =============================================================================

-- 1. Tipo de documento fiscal (extensível: nfce, nfse_nacional, …)
create type fiscal_document_type as enum ('nfse', 'nfe');

-- -----------------------------------------------------------------------------
-- 2. fiscal_company_settings: tipo do documento + emitente NF-e + Simples Barueri
-- -----------------------------------------------------------------------------
alter table public.fiscal_company_settings
  add column document_type fiscal_document_type not null default 'nfse',
  -- NFS-e (Simples Nacional — Barueri exige no corpo da nota, senão rejeita)
  add column codigo_opcao_simples_nacional      smallint,   -- 3 = ME/EPP
  add column regime_tributario_simples_nacional smallint,   -- 1 = federal+municipal pelo Simples
  add column discriminacao                       text,
  -- NF-e (emitente)
  add column inscricao_estadual text,
  add column regime_tributario   smallint,        -- 1 Simples · 2 SN excesso · 3 Regime Normal
  add column serie               text,            -- série própria (ex.: '101') p/ não colidir c/ emissor legado
  add column emitente_endereco   jsonb,           -- companies não guarda endereço
  -- overflow configurável (parâmetros não modelados como coluna; ex.: defaults NF-e em `parametros.nfe`)
  add column parametros          jsonb not null default '{}'::jsonb;

comment on column public.fiscal_company_settings.document_type is
  'Tipo de documento que a empresa emite (nfse | nfe). Roteia o builder/endpoint Focus.';

-- -----------------------------------------------------------------------------
-- 3. service_catalog: classificação por tipo (produto NF-e além de serviço NFS-e)
-- -----------------------------------------------------------------------------
alter table public.service_catalog
  add column document_type fiscal_document_type not null default 'nfse',
  add column discriminacao text,                  -- NFS-e
  -- NF-e (produto)
  add column ncm                     text,
  add column cest                    text,
  add column cfop_interno            text,        -- dentro da UF do emitente (ex.: 5101)
  add column cfop_interestadual      text,        -- outra UF (ex.: 6107)
  add column origem                  smallint,     -- 0 = nacional
  add column cst_icms                text,        -- ex.: '41' (imunidade)
  add column codigo_beneficio_fiscal text,        -- cBenef (ex.: SP070130)
  add column pis_cst                 text,
  add column pis_aliquota            numeric(7, 4),  -- % (ex.: 0.65) — TRIBUTADO
  add column cofins_cst              text,
  add column cofins_aliquota         numeric(7, 4),  -- % (ex.: 3.0000)
  add column codigo_produto          text,
  add column parametros              jsonb not null default '{}'::jsonb;

create index idx_service_catalog_document_type on public.service_catalog(document_type);

-- -----------------------------------------------------------------------------
-- 4. invoice_jobs: tipo + snapshot dos parâmetros fiscais + resultado genérico
--    (numero_nfse/chave_nfse já existem e são reusados genericamente p/ NF-e;
--     a UI relabela por document_type)
-- -----------------------------------------------------------------------------
alter table public.invoice_jobs
  add column document_type fiscal_document_type not null default 'nfse',
  add column parametros    jsonb not null default '{}'::jsonb,  -- snapshot congelado que gera o payload
  add column serie         text,
  add column protocolo     text;

create index idx_invoice_jobs_document_type on public.invoice_jobs(document_type);

comment on column public.invoice_jobs.parametros is
  'Snapshot dos parâmetros fiscais resolvidos (forma por document_type) usados para montar o payload — auditoria e estabilidade se a config mudar depois.';
