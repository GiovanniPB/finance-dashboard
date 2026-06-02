
-- Enum de roles
create type user_role as enum ('admin', 'editor', 'viewer');

-- Coluna role em profiles (default admin pra usuários existentes)
alter table profiles add column role user_role not null default 'admin';

-- Atualizar handle_new_user pra preservar role se vier no metadata
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'admin')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Helper: role do usuário atual
create or replace function current_user_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;
grant execute on function current_user_role() to authenticated;

-- RPC: lista audit_log paginado com filtros
create or replace function audit_log_list(
  p_table_name text default null,
  p_record_id uuid default null,
  p_changed_by uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 100,
  p_offset int default 0
) returns table(
  id bigint,
  table_name text,
  record_id uuid,
  action text,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  changed_by uuid,
  changed_at timestamptz,
  changer_name text,
  changer_email text,
  total_count bigint
) language sql stable security invoker set search_path = public as $$
  with filtered as (
    select a.*
    from audit_log a
    where (p_table_name is null or a.table_name = p_table_name)
      and (p_record_id is null or a.record_id = p_record_id)
      and (p_changed_by is null or a.changed_by = p_changed_by)
      and (p_from is null or a.changed_at >= p_from)
      and (p_to is null or a.changed_at <= p_to)
  ),
  counted as (
    select count(*) as total from filtered
  )
  select
    f.id, f.table_name, f.record_id, f.action,
    f.old_data, f.new_data, f.changed_fields,
    f.changed_by, f.changed_at,
    p.full_name, p.email,
    counted.total
  from filtered f
  left join profiles p on p.id = f.changed_by
  cross join counted
  order by f.changed_at desc
  limit p_limit offset p_offset;
$$;

