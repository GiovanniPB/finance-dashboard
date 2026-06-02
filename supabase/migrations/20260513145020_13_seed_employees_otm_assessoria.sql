
-- Funcionários da OTM Assessoria (extraídos da planilha FOLHA DE PAGAMENTO)
-- Base: jan/2025 fixo. Cost center "Comercial" pois entram no CMV.
-- (Marquei alguns como is_partner por nomes que aparecem na holding — ajustar depois)

with company as (select id from companies where trade_name = 'OTM Assessoria' limit 1),
     cc as (select id from cost_centers where code = 'COM' and company_id = (select id from company))
insert into employees (
  company_id, cost_center_id, full_name, role, base_salary, hire_date, status, is_partner
)
select company.id, cc.id, e.name, e.role, e.salary, '2024-01-01', 'active', e.is_partner
from company, cc, (values
  ('Leandro Ghiraldini Otero',              'Assessor Sênior',  24441.54::numeric, true),
  ('Giovanni Pignoli Barcelini',            'Sócio',            10000.00::numeric, true),
  ('Davi Knoop Scherer',                    'Assessor',         4000.00::numeric,  false),
  ('Jhonatan Pereira Nigro',                'Assessor',         4000.00::numeric,  false),
  ('Giuliano Castanharo Rosseto',           'Assessor',         4000.00::numeric,  false),
  ('Ramon Freitas Fonseca',                 'Assessor',         11299.46::numeric, false),
  ('Maria Eduarda Freitas Santana',         'Assessor',         5220.10::numeric,  false),
  ('Nicolas Pereira Silveira',              'Assessor',         9267.87::numeric,  false),
  ('Ivo Marcos Falcone Junior',             'Assessor Sênior',  21843.43::numeric, false),
  ('Marcio Roberto San Juam',               'Assessor',         6935.93::numeric,  false),
  ('Enrico Plenas Martini',                 'Assessor',         8742.67::numeric,  false),
  ('Gabriel Noffs Dalla',                   'Assessor',         7547.19::numeric,  false),
  ('Andre Castagna Innocente',              'Assessor',         9768.60::numeric,  false),
  ('Enzo Barros Pruano',                    'Assessor',         7061.15::numeric,  false),
  ('Eduardo Frederico de Souza Freitas',    'Assessor',         6834.81::numeric,  false),
  ('Adriane Ferreira Santos',               'Assessor',         7973.20::numeric,  false),
  ('Matheus Baptista Uliana',               'Assessor',         18016.06::numeric, false),
  ('Rodolfo de Souza Verzili',              'Assessor',         4000.00::numeric,  false)
) as e(name, role, salary, is_partner);

