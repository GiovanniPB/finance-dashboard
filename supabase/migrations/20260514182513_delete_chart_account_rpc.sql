create or replace function public.delete_chart_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account chart_of_accounts%rowtype;
  v_tx_count int;
  v_child_count int;
begin
  select * into v_account from chart_of_accounts where id = p_account_id;
  if not found then
    raise exception 'Conta não encontrada' using errcode = 'no_data_found';
  end if;

  if v_account.master_account_id is not null then
    raise exception 'Esta conta é do plano padrão e não pode ser excluída.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_child_count
  from chart_of_accounts
  where parent_id = p_account_id;

  if v_child_count > 0 then
    raise exception 'Conta possui % sub-conta(s). Exclua-as antes.', v_child_count
      using errcode = 'foreign_key_violation';
  end if;

  select count(*) into v_tx_count
  from transactions
  where account_id = p_account_id and deleted_at is null;

  if v_tx_count > 0 then
    raise exception 'Conta possui % lançamento(s) ativo(s). Remova-os antes ou desative a conta.', v_tx_count
      using errcode = 'foreign_key_violation';
  end if;

  delete from chart_of_accounts where id = p_account_id;
end;
$$;

grant execute on function public.delete_chart_account(uuid) to authenticated;
