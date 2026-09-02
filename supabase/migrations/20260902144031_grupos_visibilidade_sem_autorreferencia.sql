-- =============================================================================
-- Visibilidade de grupo deixa de consultar a própria tabela
--
-- O BUG. Criar grupo pela UI falhava com
--
--   new row violates row-level security policy for table "company_groups"
--
-- para um super admin, com TODOS os termos da policy de INSERT verdadeiros. A
-- policy de INSERT não era a que barrava: `supabase.from(...).insert().select()`
-- gera `INSERT ... RETURNING`, e o Postgres aplica a policy de **SELECT** à linha
-- nova. A policy de SELECT chamava `visible_company_group_ids()`, `stable`, que
-- consultava `company_groups` — dentro do mesmo statement ela vê o snapshot do
-- início, onde a linha que está sendo inserida ainda não existe. Logo o id novo
-- não entrava no conjunto, a linha "não era visível" e o RETURNING era recusado.
--
-- Medido no remoto, impersonando o super admin como `authenticated`:
--
--   INSERT sem RETURNING  -> PASSOU
--   INSERT com RETURNING  -> FALHOU (42501, a mensagem acima)
--   SELECT da linha já existente -> 1 linha
--
-- Por que passou no teste local da migration anterior: lá o insert foi testado
-- SEM `returning`. O furo era do teste, não da policy.
--
-- A CORREÇÃO. Inverter o conjunto: em vez de "quais grupos eu vejo" (que exige ler
-- `company_groups`), calcular "quais grupos estão OCULTOS para mim", o que se
-- responde só com `company_group_members`. Grupo recém-criado não tem membro, então
-- não está oculto — a linha é visível e o RETURNING passa.
--
-- A semântica não muda: grupo é oculto se, e só se, tem empresa fora do meu acesso.
-- Grupo sem membro seguia visível antes (o `not exists` era verdadeiro) e segue
-- visível agora. E a forma continua O(1) por linha: subquery não-correlacionada, que
-- o planner hasheia uma vez (`id NOT IN (hashed SubPlan)`).
--
-- REGRA GERAL que sai daqui: policy de SELECT de tabela cuja UI insere com
-- `.select()` NÃO pode consultar a própria tabela. Vale para qualquer tabela nova.
-- =============================================================================

create or replace function public.hidden_company_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Só `company_group_members`: nada de `company_groups`, senão a linha em inserção
  -- fica invisível para o próprio RETURNING que a criou.
  select distinct m.group_id
  from public.company_group_members m
  where not public.is_super_admin()
    and m.company_id not in (
      select ca.company_id
      from public.company_access ca
      where ca.user_id = auth.uid()
    );
$$;

comment on function public.hidden_company_group_ids() is
  'Ids dos grupos com alguma empresa fora do acesso do usuário atual — os que ele NÃO pode ver. Lê só company_group_members, de propósito: consultar company_groups aqui esconderia a linha recém-inserida do próprio INSERT ... RETURNING. Sem argumento para virar InitPlan nas policies.';

revoke execute on function public.hidden_company_group_ids() from public, anon;
grant execute on function public.hidden_company_group_ids() to authenticated;

-- Policies passam a usar o conjunto invertido.
drop policy if exists company_groups_sel on public.company_groups;
create policy company_groups_sel on public.company_groups
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and id not in (select public.hidden_company_group_ids())
  );

drop policy if exists company_groups_upd on public.company_groups;
create policy company_groups_upd on public.company_groups
  for update to authenticated
  using (
    id not in (select public.hidden_company_group_ids())
    and (
      (select public.is_super_admin())
      or (select public.current_user_role()) in ('admin', 'editor')
    )
  )
  with check (
    id not in (select public.hidden_company_group_ids())
    and (
      (select public.is_super_admin())
      or (select public.current_user_role()) in ('admin', 'editor')
    )
  );

drop policy if exists company_groups_del on public.company_groups;
create policy company_groups_del on public.company_groups
  for delete to authenticated
  using (
    id not in (select public.hidden_company_group_ids())
    and (
      (select public.is_super_admin())
      or (select public.current_user_role()) in ('admin', 'editor')
    )
  );

drop policy if exists company_group_members_sel on public.company_group_members;
create policy company_group_members_sel on public.company_group_members
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and group_id not in (select public.hidden_company_group_ids())
  );

-- `visible_company_group_ids()` não tem mais uso e some junto: deixá-la seria uma
-- segunda resposta para "quem vê qual grupo", livre de divergir da que vale.
drop function if exists public.visible_company_group_ids();
