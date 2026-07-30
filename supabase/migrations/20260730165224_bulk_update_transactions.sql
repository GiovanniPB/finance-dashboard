-- Edição em massa de lançamentos.
--
-- Atribuir conta bancária a centenas de lançamentos um a um é inviável, e é
-- exatamente o que precisa ser feito nos lançamentos que ficaram sem conta.
--
-- O patch vem como jsonb para distinguir três casos que um update comum não
-- distingue: campo ausente (não mexe), campo presente com valor (troca) e campo
-- presente com null (limpa). `p_patch ? 'chave'` é o teste de presença.
--
-- security invoker: a RLS de update em transactions decide o que o usuário pode
-- alterar, e o trigger de auditoria registra linha a linha como sempre.

create or replace function public.bulk_update_transactions(
  p_ids uuid[],
  p_patch jsonb
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
  v_allowed text[] := array[
    'bank_account_id', 'account_id', 'cost_center_id',
    'counterparty_id', 'status', 'cash_date'
  ];
  v_key text;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  -- Teto de segurança: uma edição em massa acidental não deve varrer a base
  -- inteira, e o array cru também não deve crescer sem limite.
  if array_length(p_ids, 1) > 2000 then
    raise exception 'Edição em massa limitada a 2000 lançamentos por vez (recebidos: %)',
      array_length(p_ids, 1)
      using errcode = 'program_limit_exceeded';
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'Nenhum campo informado para alteração'
      using errcode = 'check_violation';
  end if;

  -- Recusa chaves desconhecidas em vez de ignorá-las em silêncio: um erro de
  -- digitação no cliente viraria "salvou mas não mudou nada".
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'Campo "%" não pode ser editado em massa', v_key
        using errcode = 'check_violation';
    end if;
  end loop;

  update transactions t set
    bank_account_id = case
      when p_patch ? 'bank_account_id'
        then nullif(p_patch->>'bank_account_id', '')::uuid
      else t.bank_account_id end,
    account_id = case
      when p_patch ? 'account_id' and nullif(p_patch->>'account_id', '') is not null
        then (p_patch->>'account_id')::uuid
      else t.account_id end,
    cost_center_id = case
      when p_patch ? 'cost_center_id'
        then nullif(p_patch->>'cost_center_id', '')::uuid
      else t.cost_center_id end,
    counterparty_id = case
      when p_patch ? 'counterparty_id'
        then nullif(p_patch->>'counterparty_id', '')::uuid
      else t.counterparty_id end,
    status = case
      when p_patch ? 'status' and nullif(p_patch->>'status', '') is not null
        then (p_patch->>'status')::transaction_status
      else t.status end,
    -- Só preenche a data de caixa de quem ainda não tem, para não reescrever
    -- datas corretas de lançamentos já liquidados.
    cash_date = case
      when p_patch ? 'cash_date' and nullif(p_patch->>'cash_date', '') is not null
        then coalesce(t.cash_date, (p_patch->>'cash_date')::date)
      else t.cash_date end
  where t.id = any(p_ids)
    and t.deleted_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.bulk_update_transactions(uuid[], jsonb) is
  'Aplica um patch a vários lançamentos. Chave ausente no jsonb = campo intocado; chave com null = campo limpo. account_id e status não aceitam null (são not null na tabela).';
