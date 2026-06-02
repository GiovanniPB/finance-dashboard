create or replace function public.bank_account_usage(p_id uuid)
returns table(
  transactions bigint,
  statement_lines bigint,
  recurring_templates bigint,
  snapshots bigint
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select
    (select count(*) from transactions
       where bank_account_id = p_id and deleted_at is null),
    (select count(*) from bank_statement_lines where bank_account_id = p_id),
    (select count(*) from recurring_templates where bank_account_id = p_id),
    (select count(*) from cash_balance_snapshots where bank_account_id = p_id);
$$;

comment on function public.bank_account_usage(uuid) is
  'Counts records referencing a bank account, to warn before deletion. '
  'statement_lines and snapshots are cascade-deleted; transactions and '
  'recurring_templates are set null on delete.';
