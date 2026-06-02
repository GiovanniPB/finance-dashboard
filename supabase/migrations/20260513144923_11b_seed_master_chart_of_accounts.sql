
with org as (select id from organizations where name = 'OTM Group' limit 1)
insert into chart_of_accounts_master
  (organization_id, code, name, kind, dre_section, is_summary, below_the_line, sign_hint, sort_order)
select org.id, code, name, kind::account_kind, sec::dre_section, is_sum, below, sign, ord
from org, (values
  ('1',       '(+) Venda Bruta',                          'summary',              'gross_revenue',          true,  false, '+',  100),
  ('1.01',    'Venda de Serviços',                        'revenue',              'gross_revenue',          false, false, '+',  110),
  ('1.02',    'Outras Receitas Operacionais',             'revenue',              'gross_revenue',          false, false, '+',  120),
  ('2',       '(-) Deduções da Receita',                  'summary',              'revenue_deductions',     true,  false, '-',  200),
  ('2.01',    'IRRF',                                     'revenue_deduction',    'revenue_deductions',     false, false, '-',  210),
  ('2.02',    'ISS',                                      'revenue_deduction',    'revenue_deductions',     false, false, '-',  220),
  ('2.03',    'PIS',                                      'revenue_deduction',    'revenue_deductions',     false, false, '-',  230),
  ('2.04',    'COFINS',                                   'revenue_deduction',    'revenue_deductions',     false, false, '-',  240),
  ('2.05',    'IRPJ',                                     'revenue_deduction',    'revenue_deductions',     false, false, '-',  250),
  ('2.06',    'CSLL',                                     'revenue_deduction',    'revenue_deductions',     false, false, '-',  260),
  ('2.07',    'Outros Impostos',                          'revenue_deduction',    'revenue_deductions',     false, false, '-',  270),
  ('2.08',    'DAS - Simples Nacional',                   'revenue_deduction',    'revenue_deductions',     false, false, '-',  280),
  ('3',       '(=) Venda Líquida',                        'summary',              'net_revenue',            true,  false, '=',  300),
  ('4',       '(-) Custo dos Serviços Vendidos',          'summary',              'cogs',                   true,  false, '-',  400),
  ('4.01',    'Custo Produto/Mercadoria Vendida - Fixo',  'cogs',                 'cogs',                   false, false, '-',  410),
  ('4.02',    'Variável + Férias + 13º + Acerto + Rescisão', 'cogs',              'cogs',                   false, false, '-',  420),
  ('5',       '(=) Margem de Contribuição',               'summary',              'contribution_margin',    true,  false, '=',  500),
  ('6',       '(-) Custos e Despesas Fixas',              'summary',              'fixed_costs',            true,  false, '-',  600),
  ('6.1',     '(=) Pessoal',                              'summary',              'fixed_costs_personnel',  true,  false, '=',  610),
  ('6.1.01',  'Salários',                                 'personnel_expense',    'fixed_costs_personnel',  false, false, '-',  611),
  ('6.1.02',  'Encargos Sociais',                         'personnel_expense',    'fixed_costs_personnel',  false, false, '-',  612),
  ('6.1.03',  'Outros Gastos Funcionais',                 'personnel_expense',    'fixed_costs_personnel',  false, false, '-',  613),
  ('6.1.04',  'Saúde do Trabalhador / PPP',               'personnel_expense',    'fixed_costs_personnel',  false, false, '-',  614),
  ('6.1.05',  'Vale Transporte',                          'personnel_expense',    'fixed_costs_personnel',  false, false, '-',  615),
  ('6.1.06',  'Vale Alimentação',                         'personnel_expense',    'fixed_costs_personnel',  false, false, '-',  616),
  ('6.1.07',  'Seguro de Vida',                           'personnel_expense',    'fixed_costs_personnel',  false, false, '-',  617),
  ('6.2',     '(=) Utilidades e Serviços',                'summary',              'fixed_costs_utilities',  true,  false, '=',  620),
  ('6.2.01',  'Energia Elétrica',                         'operating_expense',    'fixed_costs_utilities',  false, false, '-',  621),
  ('6.2.02',  'Água e Esgoto',                            'operating_expense',    'fixed_costs_utilities',  false, false, '-',  622),
  ('6.2.03',  'Telefone Fixo',                            'operating_expense',    'fixed_costs_utilities',  false, false, '-',  623),
  ('6.2.04',  'Telefone Celular',                         'operating_expense',    'fixed_costs_utilities',  false, false, '-',  624),
  ('6.2.05',  'Internet',                                 'operating_expense',    'fixed_costs_utilities',  false, false, '-',  625),
  ('6.2.06',  'Aluguel',                                  'operating_expense',    'fixed_costs_utilities',  false, false, '-',  626),
  ('6.2.07',  'Condomínio',                               'operating_expense',    'fixed_costs_utilities',  false, false, '-',  627),
  ('6.2.08',  'Sistema de Informática',                   'operating_expense',    'fixed_costs_utilities',  false, false, '-',  628),
  ('6.2.09',  'Serviço de Contabilidade',                 'operating_expense',    'fixed_costs_utilities',  false, false, '-',  629),
  ('6.2.10',  'Multas de Trânsito',                       'operating_expense',    'fixed_costs_utilities',  false, false, '-',  630),
  ('6.2.11',  'Viagens e Representações',                 'operating_expense',    'fixed_costs_utilities',  false, false, '-',  631),
  ('6.2.12',  'Material de Escritório/Expediente',        'operating_expense',    'fixed_costs_utilities',  false, false, '-',  632),
  ('6.2.13',  'Higiene e Limpeza',                        'operating_expense',    'fixed_costs_utilities',  false, false, '-',  633),
  ('6.2.14',  'Copa e Cozinha',                           'operating_expense',    'fixed_costs_utilities',  false, false, '-',  634),
  ('6.2.15',  'Manutenção e Reparos',                     'operating_expense',    'fixed_costs_utilities',  false, false, '-',  635),
  ('6.2.16',  'Publicidade e Propaganda',                 'operating_expense',    'fixed_costs_utilities',  false, false, '-',  636),
  ('6.2.17',  'Patrocínios e Doações',                    'operating_expense',    'fixed_costs_utilities',  false, false, '-',  637),
  ('6.2.18',  'Alvará Municipal',                         'operating_expense',    'fixed_costs_utilities',  false, false, '-',  638),
  ('6.2.19',  'IPTU',                                     'operating_expense',    'fixed_costs_utilities',  false, false, '-',  639),
  ('6.2.20',  'Consultoria / Assessoria / Cursos',        'operating_expense',    'fixed_costs_utilities',  false, false, '-',  640),
  ('6.2.21',  'Taxas Ambientais',                         'operating_expense',    'fixed_costs_utilities',  false, false, '-',  641),
  ('6.2.22',  'Bombeiros',                                'operating_expense',    'fixed_costs_utilities',  false, false, '-',  642),
  ('6.2.23',  'Extintor de Incêndio',                     'operating_expense',    'fixed_costs_utilities',  false, false, '-',  643),
  ('6.2.24',  'Taxas Diversas - alteração contratual',    'operating_expense',    'fixed_costs_utilities',  false, false, '-',  644),
  ('6.2.25',  'Confraternização',                         'operating_expense',    'fixed_costs_utilities',  false, false, '-',  645),
  ('6.2.26',  'Camisas / Vacinas / Fotógrafo / Congresso','operating_expense',    'fixed_costs_utilities',  false, false, '-',  646),
  ('6.2.27',  'Diversos - Móveis',                        'operating_expense',    'fixed_costs_utilities',  false, false, '-',  647),
  ('6.2.28',  'Cartão',                                   'operating_expense',    'fixed_costs_utilities',  false, false, '-',  648),
  ('7',       '(=) Despesas/Receitas Financeiras',        'summary',              'financial_result',       true,  false, '=',  700),
  ('7.01',    'Rendimento de Aplicações Financeiras',     'financial_income',     'financial_result',       false, false, '+',  710),
  ('7.02',    'Juros Cheque Especial',                    'financial_expense',    'financial_result',       false, false, '-',  720),
  ('7.03',    'Juros Fornecedores',                       'financial_expense',    'financial_result',       false, false, '-',  730),
  ('7.04',    'Tarifas Bancárias',                        'financial_expense',    'financial_result',       false, false, '-',  740),
  ('7.05',    'IOF',                                      'financial_expense',    'financial_result',       false, false, '-',  750),
  ('7.06',    'Empréstimo',                               'financial_expense',    'financial_result',       false, false, '-',  760),
  ('7.07',    'Financiamento',                            'financial_expense',    'financial_result',       false, false, '-',  770),
  ('7.08',    'Outras Despesas Bancárias',                'financial_expense',    'financial_result',       false, false, '-',  780),
  ('8',       '(=) Resultado Líquido (RL)',               'summary',              'net_result',             true,  false, '=',  800),
  ('9.01',    'Distribuição de Dividendos',               'dividend',             'capital_movements',      false, true,  '-',  900),
  ('9.02',    'Bônus Líquido a Sócios',                   'partner_bonus',        'capital_movements',      false, true,  '+',  910),
  ('9.03',    'IRRF sobre Bônus',                         'partner_bonus',        'capital_movements',      false, true,  '-',  920),
  ('9.04',    'Reembolso - Cartão de Crédito',            'partner_reimbursement','capital_movements',      false, true,  '-',  930),
  ('9.05',    '(+/-) Geração de Caixa Líquida',           'summary',              'cash_generation',        true,  true,  '+/-',940),
  ('9.06',    'Saldo Início do Período',                  'summary',              'balance_snapshot',       true,  true,  '=',  950),
  ('9.07',    'Saldo Final do Período',                   'summary',              'balance_snapshot',       true,  true,  '=',  960)
) as t(code, name, kind, sec, is_sum, below, sign, ord);

-- ajustar parent_id por código (resolve "1.01" → "1", "6.1.01" → "6.1")
update chart_of_accounts_master c
set parent_id = p.id
from chart_of_accounts_master p
where p.organization_id = c.organization_id
  and position('.' in c.code) > 0
  and p.code = left(c.code, length(c.code) - position('.' in reverse(c.code)));

