-- Toda empresa operacional deve nascer com o plano de contas padrão da organização
-- (cópia do chart_of_accounts_master). Até aqui isso só acontecia via o seed único
-- (migration 12), então empresas criadas depois pela UI vinham sem contas.
--
-- Esta migration torna o comportamento definitivo:
--   1. função de seed idempotente que copia o master da organização;
--   2. trigger AFTER INSERT em companies que a dispara para empresas não-holding;
--   3. backfill das empresas operacionais existentes que estejam sem plano de contas.

-- 1) Função de seed — copia o master da organização para a empresa e resolve o parent_id.
-- SECURITY DEFINER: roda como sistema (bypassa RLS); criar empresa já exige super admin.
-- Idempotente: on conflict (company_id, code) do nothing → não duplica nem sobrescreve
-- contas customizadas já existentes.
create or replace function public.seed_company_chart_of_accounts(p_company_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_is_holding boolean;
  v_inserted int;
begin
  select organization_id, is_holding
    into v_org, v_is_holding
  from companies
  where id = p_company_id;

  if not found then
    raise exception 'Empresa % não encontrada', p_company_id using errcode = 'no_data_found';
  end if;

  -- Holdings consolidam; não recebem plano de contas operacional próprio.
  if v_is_holding then
    return 0;
  end if;

  insert into chart_of_accounts (
    company_id, code, name, kind, dre_section, master_account_id,
    is_summary, below_the_line, sign_hint, sort_order, is_active
  )
  select
    p_company_id, m.code, m.name, m.kind, m.dre_section, m.id,
    m.is_summary, m.below_the_line, m.sign_hint, m.sort_order, true
  from chart_of_accounts_master m
  where m.organization_id = v_org
  on conflict (company_id, code) do nothing;

  get diagnostics v_inserted = row_count;

  -- Reconstrói a hierarquia (parent_id) desta empresa a partir do master.
  update chart_of_accounts c
  set parent_id = (
    select pc.id
    from chart_of_accounts pc
    join chart_of_accounts_master pm on pm.id = pc.master_account_id
    join chart_of_accounts_master m on m.id = c.master_account_id
    where pm.id = m.parent_id
      and pc.company_id = c.company_id
    limit 1
  )
  where c.company_id = p_company_id
    and c.master_account_id is not null;

  return v_inserted;
end;
$$;

-- 2) Trigger: toda empresa operacional nova nasce com o plano padrão.
create or replace function public.trg_seed_company_coa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_holding then
    perform public.seed_company_chart_of_accounts(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_companies_seed_coa on public.companies;
create trigger trg_companies_seed_coa
  after insert on public.companies
  for each row execute function public.trg_seed_company_coa();

-- 3) Backfill: empresas operacionais existentes que ficaram sem plano de contas
-- (ex.: criadas pela UI antes desta correção). Idempotente pelo on conflict acima.
select public.seed_company_chart_of_accounts(c.id)
from public.companies c
where c.is_holding = false;
