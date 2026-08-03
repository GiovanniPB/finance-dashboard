-- Templates de relatório em PDF.
--
-- Um template é **metadado de configuração**, não dado financeiro: guarda quais
-- blocos entram, o período e o comparativo. Os números continuam vindo dos RPCs
-- protegidos por RLS na hora de gerar, então o risco aqui é de escrita indevida
-- (alterar o template da empresa alheia), não de vazamento de valores.

-- 1) Helper de acesso por organização.
--
--    Necessário porque template consolidado tem `company_id is null` — não há
--    empresa para `has_company_access` checar. A regra: super admin sempre; senão
--    é preciso ter acesso a **ao menos uma** empresa da organização.
create or replace function public.has_organization_access(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.company_access ca
      join public.companies c on c.id = ca.company_id
      where ca.user_id = auth.uid()
        and c.organization_id = p_organization_id
    );
$$;

comment on function public.has_organization_access(uuid) is
  'Usuário tem acesso a alguma empresa da organização? Para recursos de escopo consolidado, onde company_id é nulo.';

revoke execute on function public.has_organization_access(uuid) from public, anon;
grant execute on function public.has_organization_access(uuid) to authenticated;

-- 2) Alvo para a FK composta abaixo.
--    `id` já é PK, então esta unicidade é redundante como restrição — existe só
--    para permitir referenciar o par (id, organization_id).
alter table public.companies
  add constraint companies_id_org_uk unique (id, organization_id);

-- 3) Tabela.
create table public.report_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  -- null = template de escopo consolidado
  company_id      uuid references public.companies(id) on delete cascade,
  name            text not null,
  description     text,
  -- ReportConfig serializada (com `version`) — ver src/features/report-builder/schema.ts
  config          jsonb not null default '{}'::jsonb,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb,

  constraint report_templates_name_ck check (length(btrim(name)) between 1 and 120),

  -- A empresa precisa pertencer à organização do template. CHECK não aceita
  -- subquery, então a garantia é uma FK composta; com `company_id` nulo a FK não
  -- é verificada (MATCH SIMPLE), que é o que o escopo consolidado precisa.
  constraint report_templates_company_org_fk
    foreign key (company_id, organization_id)
    references public.companies(id, organization_id)
    on delete cascade
);

comment on table public.report_templates is
  'Composições salvas do builder de relatórios em PDF. Metadado de configuração; os valores vêm dos RPCs com RLS na geração.';

create trigger trg_report_templates_updated before update on public.report_templates
  for each row execute function set_updated_at();

create trigger trg_audit_report_templates
  after insert or update or delete on public.report_templates
  for each row execute function audit_record();

create index idx_report_templates_org on public.report_templates(organization_id);
create index idx_report_templates_company on public.report_templates(company_id);

-- 4) RLS.
--    Leitura: acesso à organização + módulo financials visível.
--    Escrita: além disso, papel de escrita na empresa do template. Template
--    consolidado vale para o grupo inteiro, então só super admin escreve.
alter table public.report_templates enable row level security;

create policy "report_templates_sel" on public.report_templates
  for select
  to authenticated
  using (
    public.has_organization_access(organization_id)
    and public.can_view_module('financials')
  );

create policy "report_templates_ins" on public.report_templates
  for insert
  to authenticated
  with check (
    public.has_organization_access(organization_id)
    and public.can_view_module('financials')
    and case
      when company_id is null then public.is_super_admin()
      else public.has_company_write_access(company_id)
    end
  );

create policy "report_templates_upd" on public.report_templates
  for update
  to authenticated
  using (
    public.has_organization_access(organization_id)
    and case
      when company_id is null then public.is_super_admin()
      else public.has_company_write_access(company_id)
    end
  )
  with check (
    public.has_organization_access(organization_id)
    and case
      when company_id is null then public.is_super_admin()
      else public.has_company_write_access(company_id)
    end
  );

create policy "report_templates_del" on public.report_templates
  for delete
  to authenticated
  using (
    public.has_organization_access(organization_id)
    and case
      when company_id is null then public.is_super_admin()
      else public.has_company_write_access(company_id)
    end
  );
