
-- Contas bancárias da OTM Assessoria (extraídas da planilha)
with company as (select id from companies where trade_name = 'OTM Assessoria' limit 1)
insert into bank_accounts (
  company_id, bank_name, account_type, nickname, sort_order, initial_balance, initial_balance_date
)
select company.id, b.bank, b.type::bank_account_type, b.nick, b.ord, 0, '2024-12-01'
from company, (values
  ('BTG Pactual', 'checking',      'BTG Pactual - conta remunerada',              1),
  ('C6 Bank',     'checking',      'C6 Bank - conta corrente',                    2),
  ('C6 Bank',     'cdb_automatic', 'C6 Bank - CDB Resgate Automático',            3),
  ('C6 Bank',     'cdb_daily',     'C6 Bank - CDB Liquidação diária',             4),
  ('C6 Bank',     'cdb_term',      'C6 Bank - CDB Limite Garantido',              5),
  ('C6 Bank',     'cdb_term',      'C6 Bank - CDB C6 empresa (seguro op.)',       6)
) as b(bank, type, nick, ord);

