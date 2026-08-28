-- Balanço gerencial por centro de custo (a "planilha Balanço OTM" dentro do app).
--
-- O relatório é uma matriz mês × linha. Uma linha é de um de três tipos:
--   'cost_centers' — soma de uma medida (receita/despesa/líquido) de N centros;
--   'formula'      — combinação com sinal de OUTRAS linhas (Ebitda = Receita − Assessores − Opex − Áreas de Apoio);
--   'ratio'        — divisão de duas linhas, em % (Margem = Lucro Líquido ÷ Receita).
--
-- POR QUE A DEFINIÇÃO É jsonb E NÃO TABELAS RELACIONAIS. O modelo é editado como
-- documento (adicionar linha, reordenar, trocar membros e fórmula) e salvo inteiro
-- de uma vez; em tabelas isso vira delete+insert de filhas a cada salvamento, sem
-- ganho real. É o mesmo tratamento de `report_templates.config`: metadado de
-- configuração validado por Zod na fronteira (src/features/balance/schema.ts).
-- O risco de um id de centro de custo virar órfão no jsonb é coberto no cálculo:
-- todo centro com movimento que nenhuma linha referencia cai numa linha sintética
-- "Não classificado", então o relatório sempre fecha com o total da empresa.
--
-- POR QUE UM MODELO POR EMPRESA. As linhas apontam para centros de custo, que são
-- por empresa — um modelo compartilhado referenciaria centros de outra empresa.

create table public.balance_report_models (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null unique references public.companies(id) on delete cascade,
  lines       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  metadata    jsonb not null default '{}'::jsonb,

  constraint balance_report_models_lines_is_array_ck check (jsonb_typeof(lines) = 'array')
);

comment on table public.balance_report_models is
  'Definição das linhas do balanço gerencial por empresa. Metadado de configuração; os valores vêm de cost_center_monthly_series com RLS.';

create trigger trg_balance_report_models_updated before update on public.balance_report_models
  for each row execute function set_updated_at();

create trigger trg_audit_balance_report_models
  after insert or update or delete on public.balance_report_models
  for each row execute function audit_record();

-- RLS: leitura pelo módulo financials + escopo de empresa (predicado sem
-- dependência de linha dentro de `(select …)`, escopo como `coluna in (subquery)`
-- — ver a convenção em CLAUDE.md e a migration …_rls_initplan_optimization).
alter table public.balance_report_models enable row level security;

create policy "balance_report_models_sel" on public.balance_report_models
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or company_id in (
           select ca.company_id from public.company_access ca
           where ca.user_id = (select auth.uid())
         )
    )
  );

create policy "balance_report_models_ins" on public.balance_report_models
  for insert to authenticated
  with check (public.has_company_write_access(company_id));

create policy "balance_report_models_upd" on public.balance_report_models
  for update to authenticated
  using (public.has_company_write_access(company_id))
  with check (public.has_company_write_access(company_id));

create policy "balance_report_models_del" on public.balance_report_models
  for delete to authenticated
  using (public.has_company_write_access(company_id));

-- Série mensal por centro de custo — a matéria-prima da matriz.
--
-- Devolve o dado cru (um par mês × centro por linha) e deixa o cálculo das linhas
-- e fórmulas no TypeScript, onde ele é testável sem banco. É por isso que a RPC
-- não sabe o que é Ebitda.
--
-- COMPETÊNCIA: mesma regra da DRE desde 20260812191239 — `settled`, `reconciled` e
-- `pending` por `accrual_date`. `scheduled` fica de fora (é ocorrência futura de
-- recorrência, previsão e não fato). Alinhar aqui importa porque as duas telas
-- ficam lado a lado e passariam a divergir assim que a projeção do pagar.me
-- gerar linhas pendentes.
--
-- Mês sem movimento não volta linha: o eixo de meses é montado no cliente a
-- partir do período, então o buraco vira zero na matriz.
create function public.cost_center_monthly_series(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  month date,
  cost_center_id uuid,
  cost_center_name text,
  revenue numeric,
  expense numeric,
  transaction_count int
)
language sql
stable
set search_path to 'public'
as $$
  select
    date_trunc('month', t.accrual_date)::date as month,
    t.cost_center_id,
    coalesce(cc.name, 'Sem centro de custo') as cost_center_name,
    sum(case when t.direction = 'inflow'  then t.amount else 0 end) as revenue,
    sum(case when t.direction = 'outflow' then t.amount else 0 end) as expense,
    count(*)::int as transaction_count
  from transactions t
  left join cost_centers cc on cc.id = t.cost_center_id
  where t.company_id = p_company_id
    and t.deleted_at is null
    and t.status in ('settled', 'reconciled', 'pending')
    and t.accrual_date between p_from and p_to
  group by 1, 2, 3;
$$;

grant execute on function public.cost_center_monthly_series(uuid, date, date) to authenticated;

-- A aba "Centros de Custo" fica ao lado do balanço na mesma tela; alinhar a
-- competência evita dois números diferentes para a mesma pergunta. Sem efeito no
-- histórico: hoje não há lançamento `pending` no banco.
--
-- Aproveita e derruba o `join chart_of_accounts` que existia aqui: só trazia
-- `a.kind`, que nunca era usado, e como `transactions.account_id` é `not null`
-- também não filtrava nada.
drop function if exists public.cost_center_analysis(uuid, date, date);

create function public.cost_center_analysis(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  cost_center_id uuid,
  cost_center_name text,
  revenue numeric,
  expense numeric,
  net numeric,
  margin_pct numeric,
  transaction_count int
)
language sql
stable
set search_path to 'public'
as $$
  with grouped as (
    select
      t.cost_center_id,
      sum(case when t.direction = 'inflow'  then t.amount else 0 end) as revenue,
      sum(case when t.direction = 'outflow' then t.amount else 0 end) as expense,
      count(*)::int as tx_count
    from transactions t
    where t.company_id = p_company_id
      and t.deleted_at is null
      and t.status in ('settled', 'reconciled', 'pending')
      and t.accrual_date between p_from and p_to
    group by t.cost_center_id
  )
  select
    g.cost_center_id,
    coalesce(cc.name, 'Sem centro de custo') as cost_center_name,
    g.revenue,
    g.expense,
    (g.revenue - g.expense) as net,
    case when g.revenue > 0 then ((g.revenue - g.expense) / g.revenue) * 100 else null end as margin_pct,
    g.tx_count as transaction_count
  from grouped g
  left join cost_centers cc on cc.id = g.cost_center_id
  order by (g.revenue - g.expense) desc nulls last;
$$;

grant execute on function public.cost_center_analysis(uuid, date, date) to authenticated;
