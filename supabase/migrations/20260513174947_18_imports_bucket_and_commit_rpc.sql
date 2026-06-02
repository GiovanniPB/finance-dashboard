
-- Bucket de Storage para arquivos originais (CSV/XLSX) dos imports
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports',
  'imports',
  false,
  10 * 1024 * 1024, -- 10 MB
  array['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']
)
on conflict (id) do nothing;

-- RLS no bucket: qualquer financial_user pode listar/upload/baixar/delete em qualquer caminho
create policy "imports_authenticated_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'imports' and is_financial_user());

create policy "imports_authenticated_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imports' and is_financial_user());

create policy "imports_authenticated_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'imports' and is_financial_user());

-- RPC: commit das rows válidas de um import_batch para transactions
create or replace function commit_import_batch(p_batch_id uuid)
returns table(
  committed_count int,
  failed_count int,
  batch_status text
) language plpgsql security invoker set search_path = public as $$
declare
  v_company_id uuid;
  v_user_id uuid;
  v_committed int := 0;
  v_failed int := 0;
  v_total int := 0;
begin
  -- Carrega contexto do batch
  select company_id, created_by into v_company_id, v_user_id
  from import_batches where id = p_batch_id;

  if v_company_id is null then
    raise exception 'Import batch % not found', p_batch_id;
  end if;

  -- Conta totais
  select count(*) into v_total from import_rows where import_batch_id = p_batch_id;

  -- Insere cada row válida como uma transaction
  with valid_rows as (
    select
      ir.id as row_id,
      (ir.parsed->>'account_id')::uuid as account_id,
      nullif(ir.parsed->>'cost_center_id', '')::uuid as cost_center_id,
      nullif(ir.parsed->>'bank_account_id', '')::uuid as bank_account_id,
      nullif(ir.parsed->>'counterparty_id', '')::uuid as counterparty_id,
      (ir.parsed->>'amount')::numeric as amount,
      (ir.parsed->>'direction')::transaction_direction as direction,
      coalesce((ir.parsed->>'status')::transaction_status, 'pending') as status,
      (ir.parsed->>'accrual_date')::date as accrual_date,
      nullif(ir.parsed->>'cash_date', '')::date as cash_date,
      ir.parsed->>'description' as description,
      nullif(ir.parsed->>'document_ref', '') as document_ref
    from import_rows ir
    where ir.import_batch_id = p_batch_id
      and ir.is_valid = true
      and ir.transaction_id is null
  ),
  inserted as (
    insert into transactions (
      company_id, account_id, cost_center_id, bank_account_id, counterparty_id,
      amount, direction, status, accrual_date, cash_date,
      description, document_ref, import_batch_id, created_by, metadata
    )
    select
      v_company_id, vr.account_id, vr.cost_center_id, vr.bank_account_id, vr.counterparty_id,
      vr.amount, vr.direction, vr.status, vr.accrual_date, vr.cash_date,
      vr.description, vr.document_ref, p_batch_id, v_user_id,
      jsonb_build_object('source','csv_import','import_row_id', vr.row_id)
    from valid_rows vr
    returning id, (metadata->>'import_row_id')::uuid as row_id
  ),
  linked as (
    update import_rows ir
    set transaction_id = inserted.id
    from inserted
    where ir.id = inserted.row_id
    returning ir.id
  )
  select count(*) into v_committed from linked;

  v_failed := v_total - v_committed;

  -- Atualiza o batch
  update import_batches
  set status = 'committed',
      committed_count = v_committed,
      failed_count = v_failed,
      updated_at = now()
  where id = p_batch_id;

  return query select v_committed, v_failed, 'committed'::text;
end;
$$;

