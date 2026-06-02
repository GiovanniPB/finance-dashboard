-- 2) company_access: which companies a non-super-admin user can see
create table if not exists public.company_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (user_id, company_id)
);

create index if not exists idx_company_access_user on public.company_access(user_id);
create index if not exists idx_company_access_company on public.company_access(company_id);

alter table public.company_access enable row level security;

-- 3) Helpers: is_super_admin + has_company_access
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.has_company_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1 from company_access
      where user_id = auth.uid() and company_id = p_company_id
    );
$$;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_company_access(uuid) to authenticated;

-- 4) RLS policies on company_access itself
drop policy if exists "company_access_super_admin_all" on public.company_access;
create policy "company_access_super_admin_all" on public.company_access
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "company_access_self_read" on public.company_access;
create policy "company_access_self_read" on public.company_access
  for select using (user_id = auth.uid());

-- 5) Backfill: give every existing user access to all currently active companies
-- (preserves current behavior while super_admin assigns proper scopes).
insert into public.company_access (user_id, company_id, created_by)
select p.id, c.id, p.id
from public.profiles p
cross join public.companies c
where c.is_active = true
on conflict do nothing;

