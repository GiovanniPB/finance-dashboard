-- =============================================================================
-- Carga inicial das regras de imposto — dado de NEGÓCIO, não schema
-- =============================================================================
--
-- POR QUE ISTO EXISTE. As regras são configuração de negócio, então não vão em
-- migration (convenção do projeto) e `supabase/seed.sql` só roda no `db:reset` local.
-- Sem este passo o banco de produção fica com as tabelas e os feriados, mas sem
-- nenhuma regra — e a aba de apuração aparece vazia.
--
-- Parâmetros extraídos das planilhas do contador:
--   · calculo iss-pis-cofins Otm assessor.xlsx
--   · calculo IRPJ-CSLL Otm assessor.xlsx
--   · calculo PIS_COFINS_jce.xlsx
--   · calculo_IRPJ_CSLL_ jce.xlsx
--
-- IDEMPOTENTE: pode rodar mais de uma vez. Empresas resolvidas por CNPJ (o id da
-- Jimmy difere entre local e produção), e o script FALHA em voz alta se uma empresa
-- esperada não existir — em vez de inserir metade e ficar quieto.
--
-- Rodar com:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/carga-regras-de-imposto.sql
-- =============================================================================

begin;

do $$
declare
  v_org          uuid;
  v_otm          uuid;
  v_jce          uuid;
  v_pai_venda    uuid;   -- "(+) Venda Bruta" no plano MESTRE
  v_m_mercadoria uuid;
  v_m_exterior   uuid;
  v_jce_pai      uuid;   -- "(+) Venda Bruta" no plano da JCE
  v_conta_div    uuid[];
  v_regra        uuid;
begin
  -- ---------------------------------------------------------------------------
  -- 0) Resolver empresas. Falha em voz alta: carga parcial de parâmetro fiscal é
  --    pior que carga nenhuma.
  -- ---------------------------------------------------------------------------
  -- CNPJ primeiro (é a identidade real e independe de ambiente); id fixo do seed
  -- como reserva, porque no banco local as empresas OTM nasceram sem CNPJ.
  select id, organization_id into v_otm, v_org
    from public.companies
   where cnpj = '46985708000140' or id = '00000000-0000-0000-0000-000000000011'
   order by (cnpj = '46985708000140') desc
   limit 1;
  if v_otm is null then
    raise exception 'OTM Assessoria não encontrada (CNPJ 46985708000140)';
  end if;

  select id into v_jce
    from public.companies
   where cnpj = '37383325000100'
   limit 1;
  if v_jce is null then
    raise exception 'Jimmy Carvalho não encontrada (CNPJ 37383325000100)';
  end if;

  -- ---------------------------------------------------------------------------
  -- 1) Plano MESTRE: contas de receita que a presunção da JCE exige.
  --
  --    Tem de ser no mestre, não só na empresa: `dre_consolidated` filtra
  --    `master_account_id is not null` e agrupa por ele, então conta só da empresa
  --    DESAPARECERIA da DRE consolidada em silêncio.
  -- ---------------------------------------------------------------------------
  select id into v_pai_venda
    from public.chart_of_accounts_master
   where organization_id = v_org and code = '1';
  if v_pai_venda is null then
    raise exception 'Conta mestre "1" ((+) Venda Bruta) não encontrada';
  end if;

  insert into public.chart_of_accounts_master
    (organization_id, code, name, kind, dre_section, parent_id,
     is_summary, below_the_line, sign_hint, sort_order, is_active, presumption_class)
  values
    (v_org, '1.03', 'Venda de Mercadoria', 'revenue', 'gross_revenue', v_pai_venda,
     false, false, '+', 130, true, 'revenda_mercadoria'),
    (v_org, '1.04', 'Ganhos no Exterior',  'revenue', 'gross_revenue', v_pai_venda,
     false, false, '+', 140, true, 'financeiro_exterior')
  on conflict (organization_id, code) do update
     set presumption_class = excluded.presumption_class;

  select id into v_m_mercadoria from public.chart_of_accounts_master
   where organization_id = v_org and code = '1.03';
  select id into v_m_exterior   from public.chart_of_accounts_master
   where organization_id = v_org and code = '1.04';

  -- ---------------------------------------------------------------------------
  -- 2) Copiar as duas para o plano da JCE (só ela vende mercadoria e tem ganho no
  --    exterior; empresa nova as recebe pelo `seed_company_chart_of_accounts`).
  -- ---------------------------------------------------------------------------
  select id into v_jce_pai
    from public.chart_of_accounts where company_id = v_jce and code = '1';

  insert into public.chart_of_accounts
    (company_id, code, name, kind, dre_section, parent_id, master_account_id,
     is_summary, below_the_line, sign_hint, sort_order, is_active, presumption_class)
  values
    (v_jce, '1.03', 'Venda de Mercadoria', 'revenue', 'gross_revenue', v_jce_pai,
     v_m_mercadoria, false, false, '+', 130, true, 'revenda_mercadoria'),
    (v_jce, '1.04', 'Ganhos no Exterior',  'revenue', 'gross_revenue', v_jce_pai,
     v_m_exterior,   false, false, '+', 140, true, 'financeiro_exterior')
  on conflict (company_id, code) do update
     set presumption_class = excluded.presumption_class;

  -- ---------------------------------------------------------------------------
  -- 3) Classificar a receita existente.
  --
  --    1.02 "Outras Receitas Operacionais" vai como SERVIÇO (32%) de propósito: é o
  --    percentual de presunção MAIS ALTO, então classificar errado aqui faz pagar a
  --    mais, nunca a menos. O acerto fino é reclassificar o lançamento para 1.03 ou
  --    1.04 — decisão da contabilidade, não do código.
  -- ---------------------------------------------------------------------------
  update public.chart_of_accounts_master
     set presumption_class = 'servico_geral'
   where organization_id = v_org and code in ('1.01', '1.02')
     and presumption_class is null;

  update public.chart_of_accounts
     set presumption_class = 'servico_geral'
   where code in ('1.01', '1.02') and kind = 'revenue'
     and presumption_class is null;

  -- ---------------------------------------------------------------------------
  -- 4) OTM Assessoria — serviço puro.
  --
  --    Vencimentos ANTECIPAM para o dia útil anterior (DARF e ISS). `due_day = 31`
  --    significa último dia do mês, que é o vencimento do IRPJ/CSLL trimestral.
  -- ---------------------------------------------------------------------------
  -- ⚠️ `base_date_basis = 'cash'`: o lançamento de comissão tem `accrual_date` no mês a
  --    que a comissão SE REFERE, e a competência fiscal é a da NOTA — que nesses dados
  --    cai no `cash_date`. Por competência o IRPJ do 3t2026 daria R$ 681.872,60; por
  --    caixa dá R$ 1.543.003,86, que é o número da planilha.
  insert into public.tax_rules (
    company_id, kind, period_kind, base_source, base_date_basis, rate, uses_presumption,
    default_presumption_class, surtax_rate, surtax_monthly_allowance,
    deducts_retentions, due_day, due_month_offset, due_date_adjust, payee,
    valid_from, notes
  ) values
    (v_otm, 'iss', 'monthly', 'revenue_accounts', 'cash', 0.02,
     false, null, null, null, false, 10, 1, 'previous_business_day',
     'PREFEITURA DE BARUERI', '2026-01-01', 'ISS de Barueri sobre o faturamento do mês'),
    (v_otm, 'darf_pis', 'monthly', 'revenue_accounts', 'cash', 0.0065,
     false, null, null, null, true, 25, 1, 'previous_business_day',
     'RECEITA FEDERAL', '2026-01-01', 'PIS cumulativo'),
    (v_otm, 'darf_cofins', 'monthly', 'revenue_accounts', 'cash', 0.03,
     false, null, null, null, true, 25, 1, 'previous_business_day',
     'RECEITA FEDERAL', '2026-01-01', 'COFINS cumulativa'),
    (v_otm, 'darf_irpj', 'quarterly', 'revenue_accounts', 'cash', 0.15,
     true, 'servico_geral', 0.10, 20000, true, 31, 1, 'previous_business_day',
     'RECEITA FEDERAL', '2026-01-01',
     'Lucro presumido trimestral; adicional de 10% acima de R$ 60.000 no trimestre; IRRF de 1,5% das NFs lançado como retenção'),
    (v_otm, 'darf_csll', 'quarterly', 'revenue_accounts', 'cash', 0.09,
     true, 'servico_geral', null, null, false, 31, 1, 'previous_business_day',
     'RECEITA FEDERAL', '2026-01-01', 'Lucro presumido trimestral, sem adicional')
  on conflict (company_id, kind, valid_from) do nothing;

  -- Faixas da OTM: 32% até R$ 1.250.000 no trimestre, 35,2% no excedente.
  -- A majoração é regra da contabilidade (confirmada). A planilha aplica a faixa base
  -- sobre R$ 1.250.000 FIXOS; aqui é por interseção com a receita, que é o que impede
  -- imposto negativo em trimestre sem receita.
  insert into public.tax_rule_presumptions
    (rule_id, presumption_class, threshold_from, threshold_to, rate)
  select r.id, 'servico_geral', v.f, v.t, v.rate
    from public.tax_rules r
   cross join (values (0, 1250000, 0.32), (1250000, null, 0.352)) as v(f, t, rate)
   where r.company_id = v_otm and r.kind in ('darf_irpj', 'darf_csll')
  on conflict (rule_id, presumption_class, threshold_from) do nothing;

  -- IRRF de 10% sobre distribuição de lucros acima de R$ 49.999,99 por sócio.
  -- `full_when_exceeded` reproduz a planilha, que aplica 10% sobre o valor INTEIRO de
  -- quem passou do limite (E9 = 442.580 × 10% = 44.258). A leitura alternativa é
  -- `excess`, que tributa só o excedente — PENDENTE de confirmação da contabilidade.
  select array_agg(a.id) into v_conta_div
    from public.chart_of_accounts a
   where a.company_id = v_otm and a.kind = 'dividend';

  if v_conta_div is null or cardinality(v_conta_div) = 0 then
    raise exception 'OTM Assessoria não tem conta de dividendo — sem ela o IRRF sairia zero';
  end if;

  insert into public.tax_rules (
    company_id, kind, period_kind, base_source, base_date_basis, base_account_ids, rate,
    base_allowance, base_allowance_per_payee, base_allowance_mode,
    deducts_retentions, due_day, due_month_offset, due_date_adjust, payee,
    valid_from, notes
  ) values
    (v_otm, 'irrf_dividendos', 'monthly', 'dividends', 'cash', v_conta_div, 0.10,
     49999.99, true, 'full_when_exceeded',
     false, 20, 1, 'previous_business_day', 'RECEITA FEDERAL', '2026-01-01',
     'IRRF retido do sócio; a empresa é a fonte pagadora, então não deduz retenção própria. MODO PENDENTE de confirmação da contabilidade.')
  on conflict (company_id, kind, valid_from) do nothing;

  -- ---------------------------------------------------------------------------
  -- 5) Jimmy Carvalho — receita MISTA: mercadoria (NF-e), serviço (NFS-e) e ganho no
  --    exterior, cada um com sua presunção. A CSLL presume 12% na mercadoria contra
  --    8% do IRPJ — é a diferença que a planilha registra.
  -- ---------------------------------------------------------------------------
  insert into public.tax_rules (
    company_id, kind, period_kind, base_source, rate, uses_presumption,
    default_presumption_class, surtax_rate, surtax_monthly_allowance,
    deducts_retentions, due_day, due_month_offset, due_date_adjust, payee,
    valid_from, notes
  ) values
    (v_jce, 'iss', 'monthly', 'revenue_accounts', 0.02,
     false, null, null, null, false, 10, 1, 'previous_business_day',
     'PREFEITURA DE BARUERI', '2026-01-01',
     'ISS sobre a receita de serviço. CONFIRMAR com a contabilidade se Hotmart e plataforma também devem entrar.'),
    (v_jce, 'darf_pis', 'monthly', 'revenue_accounts', 0.0065,
     false, null, null, null, true, 25, 1, 'previous_business_day',
     'RECEITA FEDERAL', '2026-01-01', 'PIS cumulativo, com retenção da NF deduzida'),
    (v_jce, 'darf_cofins', 'monthly', 'revenue_accounts', 0.03,
     false, null, null, null, true, 25, 1, 'previous_business_day',
     'RECEITA FEDERAL', '2026-01-01', 'COFINS cumulativa, com retenção da NF deduzida'),
    (v_jce, 'darf_irpj', 'quarterly', 'revenue_accounts', 0.15,
     true, 'servico_geral', 0.10, 20000, true, 31, 1, 'previous_business_day',
     'RECEITA FEDERAL', '2026-01-01',
     'Presunção por classe: mercadoria 8%, serviço 32%, exterior 100%. Adicional configurado — a planilha não tinha a linha.'),
    (v_jce, 'darf_csll', 'quarterly', 'revenue_accounts', 0.09,
     true, 'servico_geral', null, null, false, 31, 1, 'previous_business_day',
     'RECEITA FEDERAL', '2026-01-01',
     'Presunção por classe: mercadoria 12%, serviço 32%, exterior 100%')
  on conflict (company_id, kind, valid_from) do nothing;

  insert into public.tax_rule_presumptions
    (rule_id, presumption_class, threshold_from, threshold_to, rate)
  select r.id, v.cls::public.tax_presumption_class, 0, null, v.rate
    from public.tax_rules r
   cross join (values ('revenda_mercadoria', 0.08), ('servico_geral', 0.32),
                      ('financeiro_exterior', 1.0)) as v(cls, rate)
   where r.company_id = v_jce and r.kind = 'darf_irpj'
  on conflict (rule_id, presumption_class, threshold_from) do nothing;

  insert into public.tax_rule_presumptions
    (rule_id, presumption_class, threshold_from, threshold_to, rate)
  select r.id, v.cls::public.tax_presumption_class, 0, null, v.rate
    from public.tax_rules r
   cross join (values ('revenda_mercadoria', 0.12), ('servico_geral', 0.32),
                      ('financeiro_exterior', 1.0)) as v(cls, rate)
   where r.company_id = v_jce and r.kind = 'darf_csll'
  on conflict (rule_id, presumption_class, threshold_from) do nothing;

  -- ---------------------------------------------------------------------------
  -- 6) OTM Corretora e RCO Tecnologia são SIMPLES NACIONAL: sem regra aqui.
  --    O DAS tem alíquota efetiva progressiva sobre o RBT12, que este motor não
  --    calcula — continua saindo por `generate_tax_obligations` +
  --    `calculate_simples_anexo_iii`, na aba de obrigações.
  -- ---------------------------------------------------------------------------

  -- ---------------------------------------------------------------------------
  -- 7) Conferência: o que deveria existir, existe.
  -- ---------------------------------------------------------------------------
  if (select count(*) from public.tax_rules where company_id = v_otm) <> 6 then
    raise exception 'OTM Assessoria devia ter 6 regras, tem %',
      (select count(*) from public.tax_rules where company_id = v_otm);
  end if;
  if (select count(*) from public.tax_rules where company_id = v_jce) <> 5 then
    raise exception 'Jimmy Carvalho devia ter 5 regras, tem %',
      (select count(*) from public.tax_rules where company_id = v_jce);
  end if;

  select id into v_regra from public.tax_rules
   where company_id = v_otm and kind = 'darf_irpj';
  if (select count(*) from public.tax_rule_presumptions where rule_id = v_regra) <> 2 then
    raise exception 'IRPJ da OTM devia ter 2 faixas de presunção';
  end if;

  raise notice 'Carga concluída: 6 regras da OTM Assessoria, 5 da Jimmy Carvalho.';
end $$;

commit;
