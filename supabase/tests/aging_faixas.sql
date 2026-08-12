-- Faixas do aging (migration 20260812135120).
--
-- O valor do card depende inteiramente de cada título cair na faixa certa, e as
-- fronteiras (vencer hoje, 30 vs 31 dias) são onde um `>=` trocado por `>` passa
-- despercebido. Aqui cada limite é afirmado dos dois lados.
--
--   bun run db:reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/aging_faixas.sql
--
-- Roda em transação e termina em rollback.
\set ON_ERROR_STOP on

begin;

create temp table resultado (n serial, cenario text, obtido text);

create or replace function pg_temp.check(p_label text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  if p_got is not distinct from p_want then
    insert into resultado (cenario, obtido) values (p_label, p_got::text);
  else
    raise exception 'FALHOU % → obtido %, esperado %', p_label, p_got, p_want;
  end if;
end $$;

do $$
declare
  v_company uuid := '00000000-0000-0000-0000-000000000013';
  v_account uuid;
  -- offset em dias a partir de hoje (negativo = vencido) → faixa esperada
  casos constant text[][] := array[
    ['-120', 'overdue_90_plus'],
    ['-91',  'overdue_90_plus'],
    ['-90',  'overdue_61_90'],
    ['-61',  'overdue_61_90'],
    ['-60',  'overdue_31_60'],
    ['-31',  'overdue_31_60'],
    ['-30',  'overdue_0_30'],
    ['-1',   'overdue_0_30'],
    ['0',    'overdue_0_30'],
    ['1',    'due_0_30'],
    ['30',   'due_0_30'],
    ['31',   'due_31_60'],
    ['60',   'due_31_60'],
    ['61',   'due_61_90'],
    ['90',   'due_61_90'],
    ['91',   'due_90_plus'],
    ['365',  'due_90_plus']
  ];
begin
  select id into v_account from chart_of_accounts
   where company_id = v_company and code = '6.2.06' limit 1;

  -- Limpa o terreno: o seed traz lançamentos desta empresa.
  delete from transactions where company_id = v_company;

  for i in 1 .. array_length(casos, 1) loop
    insert into transactions
      (company_id, account_id, amount, direction, status, accrual_date, due_date, description)
    values
      (v_company, v_account, 100.00, 'outflow', 'pending', current_date,
       current_date + (casos[i][1])::int, 'offset ' || casos[i][1]);
  end loop;

  -- Sem vencimento e um pago, que não pode entrar em faixa alguma.
  insert into transactions
    (company_id, account_id, amount, direction, status, accrual_date, due_date, description)
  values
    (v_company, v_account, 100.00, 'outflow', 'pending', current_date, null, 'sem vencimento'),
    (v_company, v_account, 100.00, 'outflow', 'settled', current_date, current_date, 'pago');

end $$;

-- As contagens por faixa provam as fronteiras por inteiro: cada faixa recebeu
-- dois títulos, um em cada extremo dela. Um `>=` trocado por `>` move um título
-- para a faixa vizinha e quebra as duas contagens de uma vez.
do $$
declare
  v_company uuid := '00000000-0000-0000-0000-000000000013';
begin
  perform pg_temp.check('vencido +90 tem 2 títulos',
    (select count from v_bills_aging where company_id = v_company
      and direction = 'outflow' and bucket = 'overdue_90_plus'), 2);
  perform pg_temp.check('vencido 61-90 tem 2 títulos',
    (select count from v_bills_aging where company_id = v_company
      and direction = 'outflow' and bucket = 'overdue_61_90'), 2);
  perform pg_temp.check('vencido 31-60 tem 2 títulos',
    (select count from v_bills_aging where company_id = v_company
      and direction = 'outflow' and bucket = 'overdue_31_60'), 2);
  perform pg_temp.check('vencido até 30 tem 3 títulos (inclui vencer hoje)',
    (select count from v_bills_aging where company_id = v_company
      and direction = 'outflow' and bucket = 'overdue_0_30'), 3);
  perform pg_temp.check('a vencer até 30 tem 2 títulos',
    (select count from v_bills_aging where company_id = v_company
      and direction = 'outflow' and bucket = 'due_0_30'), 2);
  perform pg_temp.check('a vencer 31-60 tem 2 títulos',
    (select count from v_bills_aging where company_id = v_company
      and direction = 'outflow' and bucket = 'due_31_60'), 2);
  perform pg_temp.check('a vencer 61-90 tem 2 títulos',
    (select count from v_bills_aging where company_id = v_company
      and direction = 'outflow' and bucket = 'due_61_90'), 2);
  perform pg_temp.check('a vencer +90 tem 2 títulos',
    (select count from v_bills_aging where company_id = v_company
      and direction = 'outflow' and bucket = 'due_90_plus'), 2);
  perform pg_temp.check('sem vencimento tem 1 título',
    (select count from v_bills_aging where company_id = v_company
      and direction = 'outflow' and bucket = 'no_due_date'), 1);

  -- O total do cabeçalho é a soma das faixas: nenhum título em aberto pode
  -- ficar fora, e nenhum pago pode entrar.
  perform pg_temp.check('soma das faixas = 18 títulos em aberto',
    (select sum(count)::int from v_bills_aging
      where company_id = v_company and direction = 'outflow'), 18);
  perform pg_temp.check('pago não entra em faixa alguma',
    (select coalesce(sum(total), 0) from v_bills_aging
      where company_id = v_company and direction = 'outflow'), 1800.00::numeric);
end $$;

select n, cenario, obtido from resultado order by n;

rollback;
