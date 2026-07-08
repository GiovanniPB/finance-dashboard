-- Permissions hardening (1/3): módulos de visualização + helper de escrita por papel.
--
-- Contexto: até aqui a autorização era só "tem acesso à empresa?" (has_company_access),
-- sem impor o papel (admin/editor/viewer) nem o que cada usuário pode visualizar. Este
-- é o alicerce para (a) tornar `viewer` somente-leitura de verdade e (b) permitir escopo
-- de visualização configurável por usuário (para contabilidades e afins).

-- 1) Domínios de dados que podem ser concedidos por usuário.
--    Coarse o suficiente para mapear às tabelas sem sobreposição.
create type public.data_module as enum ('financials', 'payroll', 'taxes', 'nfse', 'audit');

-- 2) visible_modules em profiles.
--    NULL  = enxerga todos os módulos (comportamento atual — usuários existentes não mudam).
--    Array = allow-list explícita (ex.: contabilidade fiscal = {financials,taxes,nfse}).
alter table public.profiles
  add column visible_modules public.data_module[];

comment on column public.profiles.visible_modules is
  'Allow-list de módulos visíveis. NULL = todos. Usado por can_view_module() nas policies de SELECT.';

-- 3) Helper: usuário pode ESCREVER na empresa? (papel + acesso)
--    super_admin sempre; admin/editor dentro das empresas atribuídas; viewer nunca.
create or replace function public.has_company_write_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or (
      public.has_company_access(p_company_id)
      and public.current_user_role() in ('admin', 'editor')
    );
$$;

-- 4) Helper: usuário pode VER o módulo?
--    super_admin sempre; senão respeita a allow-list (NULL = todos).
create or replace function public.can_view_module(p_module public.data_module)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and (visible_modules is null or p_module = any(visible_modules))
    );
$$;

revoke execute on function public.has_company_write_access(uuid) from public, anon;
revoke execute on function public.can_view_module(public.data_module) from public, anon;
grant execute on function public.has_company_write_access(uuid) to authenticated;
grant execute on function public.can_view_module(public.data_module) to authenticated;
