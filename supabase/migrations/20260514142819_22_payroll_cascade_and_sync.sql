-- 1) Trigger to sync linked transaction when a payroll_item changes (amount/notes).
--    Allows retroactive edits in posted runs without manual re-posting.
create or replace function public.sync_payroll_item_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Find the transaction generated for this item and update amount/description.
  -- gross_amount is the source of truth for the cash leg.
  update transactions
  set
    amount = new.gross_amount + coalesce(new.benefits, 0),
    description = coalesce(new.notes, description),
    updated_at = now()
  where payroll_item_id = new.id
    and deleted_at is null;
  return new;
end;
$$;

drop trigger if exists trg_sync_payroll_item_transaction on public.payroll_items;
create trigger trg_sync_payroll_item_transaction
  after update of gross_amount, benefits, notes on public.payroll_items
  for each row
  execute function public.sync_payroll_item_transaction();

-- 2) RPC to atomically delete a payroll run (draft or posted),
--    cascading to items + soft-deleting linked transactions.
create or replace function public.delete_payroll_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  -- Soft-delete any transactions linked to this run's items.
  update transactions
  set deleted_at = now(), deleted_by = v_user
  where payroll_item_id in (
    select id from payroll_items where payroll_run_id = p_run_id
  )
  and deleted_at is null;

  -- Hard-delete items (no FK depends on them once tx is soft-deleted).
  delete from payroll_items where payroll_run_id = p_run_id;

  -- Hard-delete the run.
  delete from payroll_runs where id = p_run_id;
end;
$$;

revoke all on function public.delete_payroll_run(uuid) from public;
grant execute on function public.delete_payroll_run(uuid) to authenticated;

