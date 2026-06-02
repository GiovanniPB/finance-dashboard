
-- organização
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'OTM Group');

-- empresas
insert into companies (id, organization_id, legal_name, trade_name, tax_regime, is_holding, sort_order) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'OTM Holding', 'OTM Holding', 'lucro_presumido', true, 0),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'OTM Assessoria de Investimentos Ltda', 'OTM Assessoria', 'lucro_presumido', false, 1),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'OTM Corretora de Seguros Ltda',           'OTM Corretora',  'lucro_presumido', false, 2),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'RCO Tecnologia Ltda',                      'RCO Tecnologia', 'lucro_presumido', false, 3);

-- cost centers padrão por empresa
insert into cost_centers (company_id, code, name, description)
select c.id, cc.code, cc.name, cc.description
from companies c
cross join (values
  ('COM', 'Comercial', 'Assessores/vendas — folha entra como CMV'),
  ('ADM', 'Administrativo', 'Equipe administrativa — folha entra como despesa de pessoal'),
  ('GER', 'Geral', 'Despesas gerais não alocadas')
) as cc(code, name, description)
where c.is_holding = false;

