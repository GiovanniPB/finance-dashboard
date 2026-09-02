-- =============================================================================
-- Central de custos GLOBAL — centro de custo deixa de ser por empresa
--
-- O QUE ESTAVA ERRADO. A migration anterior (…_relatorios_consolidados) manteve
-- `cost_centers` por empresa e pôs em cima uma camada de "casamento por nome"
-- (`cost_center_merge_groups`, `cost_centers.merge_group_id`,
-- `v_cost_centers_consolidated`) para juntar, no relatório, centros que são a mesma
-- coisa em empresas diferentes.
--
-- Isso resolveu o número e errou o produto: a tela de cadastro continuou pedindo uma
-- empresa, e passou a existir um segundo conceito ("nome de consolidação") que só
-- existia para compensar o primeiro. Dois níveis para uma coisa que é uma.
--
-- O MODELO CERTO. Centro de custo é da ORGANIZAÇÃO. Uma lista só, usada por qualquer
-- empresa. Com isso:
--
--   · não existe mais chave de consolidação — o relatório agrupa por `cost_center_id`,
--     porque o id já é global;
--   · não existe mais grupo de fusão — fundir passa a ser uma operação PERMANENTE na
--     própria lista (repõe as referências e apaga o duplicado), que é o que "organizar
--     uma vez e depois só usar" quer dizer;
--   · a tela de cadastro perde o seletor de empresa.
--
-- A CONVERSÃO. Os 42 centros existentes (40 ativos, 22 nomes distintos normalizados)
-- viram um por nome: um sobrevivente por `lower(btrim(name))`, e todas as referências
-- dos duplicados são remapeadas para ele. Nada é adivinhado — nome divergente
-- (`otm corretora - capex` x `capex`) permanece como DOIS centros globais, e a fusão
-- deles é decisão de quem organiza, feita na UI.
--
-- Referências remapeadas: `transactions.cost_center_id` (2.572 em produção),
-- `recurring_templates`, `employees`, `payroll_account_mappings` e o `lines` jsonb de
-- `balance_report_models` — que guarda uuid de centro dentro de `costCenterIds` e
-- passaria batido num remap ingênuo, deixando linha de balanço apontando para centro
-- apagado.
--
-- Nenhum valor muda: cada lançamento continua apontando para um centro com o mesmo
-- nome que tinha.
-- =============================================================================

-- =============================================================================
-- 1) organization_id em cost_centers
-- =============================================================================
alter table public.cost_centers
  add column organization_id uuid references public.organizations(id) on delete restrict;

update public.cost_centers cc
set organization_id = c.organization_id
from public.companies c
where c.id = cc.company_id;

-- =============================================================================
-- 2) Mapa de deduplicação: um sobrevivente por nome normalizado
--
-- Preferência do sobrevivente: ativo antes de inativo, depois o mais antigo, depois o
-- menor id — determinístico, para o resultado não depender da ordem de varredura.
-- =============================================================================
create table public._cc_dedup_map as
with ranked as (
  select
    cc.id,
    cc.organization_id,
    lower(btrim(cc.name)) as name_key,
    row_number() over (
      partition by cc.organization_id, lower(btrim(cc.name))
      order by cc.is_active desc, cc.created_at, cc.id
    ) as rn
  from public.cost_centers cc
)
select
  r.id as old_id,
  first_value(r.id) over (
    partition by r.organization_id, r.name_key order by r.rn
  ) as new_id
from ranked r;

create unique index on public._cc_dedup_map (old_id);

-- =============================================================================
-- 3) Remapeia todas as referências dos duplicados para o sobrevivente
-- =============================================================================
update public.transactions t
set cost_center_id = m.new_id
from public._cc_dedup_map m
where m.old_id = t.cost_center_id and m.new_id <> m.old_id;

update public.recurring_templates rt
set cost_center_id = m.new_id
from public._cc_dedup_map m
where m.old_id = rt.cost_center_id and m.new_id <> m.old_id;

update public.employees e
set cost_center_id = m.new_id
from public._cc_dedup_map m
where m.old_id = e.cost_center_id and m.new_id <> m.old_id;

update public.payroll_account_mappings pam
set cost_center_id = m.new_id
from public._cc_dedup_map m
where m.old_id = pam.cost_center_id and m.new_id <> m.old_id;

-- O modelo do balanço guarda uuid DENTRO de um jsonb (`costCenterIds` das linhas do
-- tipo `cost_centers`). Sem este passo, linha de balanço ficaria apontando para centro
-- apagado e o item somaria zero em silêncio.
update public.balance_report_models b
set lines = coalesce(
  (
    select jsonb_agg(
             case
               when arr.line ->> 'kind' = 'cost_centers' then
                 jsonb_set(
                   arr.line,
                   '{costCenterIds}',
                   coalesce(
                     (
                       select jsonb_agg(distinct coalesce(m.new_id::text, elem))
                       from jsonb_array_elements_text(arr.line -> 'costCenterIds') elem
                       left join public._cc_dedup_map m on m.old_id::text = elem
                     ),
                     '[]'::jsonb
                   )
                 )
               else arr.line
             end
             order by arr.ord
           )
    from jsonb_array_elements(b.lines) with ordinality as arr(line, ord)
  ),
  '[]'::jsonb
)
where jsonb_array_length(b.lines) > 0;

-- =============================================================================
-- 4) Apaga os duplicados e derruba o escopo de empresa
--
-- `company_id` tem sete dependentes: as quatro policies da tabela, a view de
-- consolidação da migration anterior, e — a que não é óbvia — `mcp_api.centros_de_custo`,
-- da qual `mcp_api.transacoes` depende. Todos precisam sair ANTES da coluna, e as views
-- do MCP voltam adiante com `organization_id` no lugar.
-- =============================================================================
delete from public.cost_centers cc
using public._cc_dedup_map m
where m.old_id = cc.id and m.new_id <> m.old_id;

drop table public._cc_dedup_map;

drop view if exists public.v_cost_centers_consolidated;
drop view if exists mcp_api.transacoes;
drop view if exists mcp_api.centros_de_custo;

drop policy if exists cost_centers_sel on public.cost_centers;
drop policy if exists cost_centers_ins on public.cost_centers;
drop policy if exists cost_centers_upd on public.cost_centers;
drop policy if exists cost_centers_del on public.cost_centers;

-- `merge_group_id` referencia a tabela de grupos de fusão; sai antes dela.
alter table public.cost_centers drop column if exists merge_group_id;
drop table if exists public.cost_center_merge_groups;

-- O índice único por (empresa, nome) e o índice por empresa caem junto com a coluna.
alter table public.cost_centers
  alter column organization_id set not null,
  drop column company_id;

create index idx_cost_centers_org on public.cost_centers(organization_id);

-- A integridade que era por empresa passa a ser por organização, com a mesma
-- normalização de antes.
create unique index cost_centers_org_name_active_uniq
  on public.cost_centers (organization_id, lower(btrim(name)))
  where is_active;

comment on table public.cost_centers is
  'Central de custos da organização. Global de propósito: um centro é a mesma coisa em qualquer empresa do grupo, e é isso que faz o relatório consolidado somar sem depender de casar nomes.';

-- =============================================================================
-- 5) Views do MCP de volta, agora por organização
--
-- `mcp_api.centros_de_custo` expunha `company_id` ao modelo (documentado em
-- _shared/mcp/tools/sql.ts). Com a central global a coluna passa a ser
-- `organization_id`; `mcp_api.transacoes` é recriada idêntica, só porque dependia dela.
-- =============================================================================
create view mcp_api.centros_de_custo with (security_invoker = true) as
  select cc.id as cost_center_id, cc.organization_id, cc.name as nome, cc.is_active as ativo
  from public.cost_centers cc;

comment on view mcp_api.centros_de_custo is
  'Central de custos da organização. Global: o mesmo centro vale para qualquer empresa do grupo.';

create view mcp_api.transacoes with (security_invoker = true) as
  select
    t.id                        as transaction_id,
    t.company_id,
    e.nome                      as empresa,
    t.accrual_date              as data_competencia,
    t.cash_date                 as data_caixa,
    t.due_date                  as vencimento,
    -- Valor COM SINAL: entrada positiva, saída negativa. Some esta coluna, nunca `valor_bruto`.
    case when t.direction = 'inflow' then t.amount else -t.amount end as valor,
    t.amount                    as valor_bruto,
    t.direction::text           as direcao,
    t.status::text              as status,
    -- Regime: competência inclui pendente (fato ocorrido, ainda não pago); caixa não.
    -- `scheduled` (previsão de recorrência) e `canceled` ficam fora dos dois.
    (t.status in ('settled', 'reconciled', 'pending')) as entra_em_competencia,
    (t.status in ('settled', 'reconciled'))            as entra_em_caixa,
    -- Transferência entre contas da mesma empresa não é receita nem despesa.
    (t.transfer_group_id is not null)                  as e_transferencia,
    -- Lançamento gerado pela projeção do pagar.me (não é lançamento humano).
    (t.pagarme_projection_key is not null)             as e_projecao_pagarme,
    a.codigo                    as conta_codigo,
    a.conta                     as conta,
    a.tipo                      as conta_tipo,
    a.secao_dre,
    cc.nome                     as centro_de_custo,
    cp.nome                     as contraparte,
    cp.documento                as contraparte_documento,
    t.description               as descricao,
    t.document_ref              as documento,
    t.cost_center_id,
    t.counterparty_id,
    t.bank_account_id
  from public.transactions t
  join mcp_api.empresas e on e.company_id = t.company_id
  left join mcp_api.contas a on a.account_id = t.account_id
  left join mcp_api.centros_de_custo cc on cc.cost_center_id = t.cost_center_id
  left join mcp_api.contrapartes cp on cp.counterparty_id = t.counterparty_id
  where t.deleted_at is null;

comment on view mcp_api.transacoes is
  'Lançamentos ativos. Some `valor` (já com sinal), não `valor_bruto`. Filtre por `entra_em_competencia` ou `entra_em_caixa` conforme o regime, e exclua `e_transferencia` de qualquer análise de receita ou despesa.';

grant select on mcp_api.centros_de_custo to authenticated;
grant select on mcp_api.transacoes        to authenticated;

-- =============================================================================
-- 6) RLS por organização
--
-- Leitura: qualquer pessoa com acesso a alguma empresa da organização. Isso EXPÕE o
-- nome dos centros usados por empresas a que a pessoa não tem acesso — é a
-- consequência de a central ser global, e o que ela expõe é nome, nunca valor: os
-- números continuam presos à RLS de `transactions`.
--
-- Escrita: por papel (admin/editor). Não há mais uma empresa a quem atribuir a
-- permissão, então `has_company_write_access` não se aplica.
-- =============================================================================
create policy cost_centers_sel on public.cost_centers
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or organization_id in (
           select c.organization_id
           from public.company_access ca
           join public.companies c on c.id = ca.company_id
           where ca.user_id = (select auth.uid())
         )
    )
  );

create policy cost_centers_ins on public.cost_centers
  for insert to authenticated
  with check (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or (
        (select public.current_user_role()) in ('admin', 'editor')
        and organization_id in (
              select c.organization_id
              from public.company_access ca
              join public.companies c on c.id = ca.company_id
              where ca.user_id = (select auth.uid())
            )
      )
    )
  );

create policy cost_centers_upd on public.cost_centers
  for update to authenticated
  using (
    (select public.is_super_admin())
    or (select public.current_user_role()) in ('admin', 'editor')
  )
  with check (
    (select public.is_super_admin())
    or (select public.current_user_role()) in ('admin', 'editor')
  );

create policy cost_centers_del on public.cost_centers
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or (select public.current_user_role()) in ('admin', 'editor')
  );

-- =============================================================================
-- 7) Fundir dois centros — permanente, e por isso no banco
--
-- Fundir toca cinco lugares (lançamentos, recorrências, colaboradores, mapeamentos de
-- folha e o jsonb do balanço) e depois apaga o centro de origem. Tem que ser tudo ou
-- nada, e é por isso que é uma RPC e não uma sequência de chamadas do cliente: uma
-- falha no meio deixaria referência apontando para centro apagado — e como a FK é
-- `on delete set null`, o efeito seria lançamento perdendo a classificação em silêncio.
--
-- `security definer` com portão explícito no topo, de propósito: com `invoker`, a RLS
-- de `transactions` filtraria as linhas de empresa que o usuário não pode escrever, o
-- UPDATE passaria "com sucesso" sobre menos linhas do que devia, e o delete seguinte
-- anularia justamente essas. Melhor recusar a operação inteira do que fundir pela
-- metade.
--
-- Não existe desfazer: fundir é ato de organização, não filtro de visualização.
-- =============================================================================
create or replace function public.merge_cost_centers(
  p_source_ids uuid[],
  p_target_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_sources uuid[];
  v_moved int := 0;
  v_count int;
begin
  if not (public.is_super_admin() or public.current_user_role() in ('admin', 'editor')) then
    raise exception 'Sem permissão para fundir centros de custo'
      using errcode = '42501';
  end if;

  select organization_id into v_org from public.cost_centers where id = p_target_id;
  if v_org is null then
    raise exception 'Centro de destino não encontrado' using errcode = 'P0002';
  end if;

  -- O destino nunca entra na lista de origem, e origem de outra organização é recusada
  -- em vez de ignorada — ignorar deixaria a pessoa achando que fundiu.
  select array_agg(cc.id) into v_sources
  from public.cost_centers cc
  where cc.id = any(p_source_ids)
    and cc.id <> p_target_id
    and cc.organization_id = v_org;

  if v_sources is null or cardinality(v_sources) = 0 then
    return 0;
  end if;

  if cardinality(v_sources) <> cardinality(array_remove(p_source_ids, p_target_id)) then
    raise exception 'Centro de origem inválido ou de outra organização' using errcode = '22023';
  end if;

  update public.transactions
  set cost_center_id = p_target_id
  where cost_center_id = any(v_sources);
  get diagnostics v_count = row_count;
  v_moved := v_moved + v_count;

  update public.recurring_templates
  set cost_center_id = p_target_id
  where cost_center_id = any(v_sources);

  update public.employees
  set cost_center_id = p_target_id
  where cost_center_id = any(v_sources);

  update public.payroll_account_mappings
  set cost_center_id = p_target_id
  where cost_center_id = any(v_sources);

  -- Mesma armadilha do jsonb da conversão: uuid dentro de `costCenterIds`.
  update public.balance_report_models b
  set lines = coalesce(
    (
      select jsonb_agg(
               case
                 when arr.line ->> 'kind' = 'cost_centers' then
                   jsonb_set(
                     arr.line,
                     '{costCenterIds}',
                     coalesce(
                       (
                         select jsonb_agg(distinct
                           case when elem = any(
                                  select unnest(v_sources)::text
                                ) then p_target_id::text else elem end
                         )
                         from jsonb_array_elements_text(arr.line -> 'costCenterIds') elem
                       ),
                       '[]'::jsonb
                     )
                   )
                 else arr.line
               end
               order by arr.ord
             )
      from jsonb_array_elements(b.lines) with ordinality as arr(line, ord)
    ),
    '[]'::jsonb
  )
  where b.organization_id = v_org
    and jsonb_array_length(b.lines) > 0;

  delete from public.cost_centers where id = any(v_sources);

  return v_moved;
end;
$$;

revoke execute on function public.merge_cost_centers(uuid[], uuid) from public, anon;
grant execute on function public.merge_cost_centers(uuid[], uuid) to authenticated;

comment on function public.merge_cost_centers(uuid[], uuid) is
  'Funde centros de custo no destino: repõe lançamentos, recorrências, colaboradores, mapeamentos de folha e as linhas do balanço, e apaga as origens. Permanente e atômica. Devolve quantos lançamentos foram movidos.';

-- =============================================================================
-- 8) Relatório de centro de custo volta a agrupar por id
--
-- Com a central global, `cost_center_id` já é a identidade compartilhada: a agregação
-- entre empresas sai de graça e a chave de consolidação por nome deixa de existir. O
-- tipo de retorno muda, então a função de recorte precisa ser derrubada antes.
-- =============================================================================
drop function if exists public.cost_center_analysis_multi(date, date, uuid[]);

create or replace function public.cost_center_analysis_multi(
  p_from date,
  p_to date,
  p_company_ids uuid[] default null
)
returns table (
  cost_center_id uuid,
  cost_center_name text,
  companies_count int,
  revenue numeric,
  expense numeric,
  net numeric,
  margin_pct numeric,
  transaction_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  with grouped as (
    select
      t.cost_center_id,
      count(distinct t.company_id)::int as companies_count,
      sum(case when t.direction = 'inflow'  then t.amount else 0 end) as revenue,
      sum(case when t.direction = 'outflow' then t.amount else 0 end) as expense,
      count(*)::int as tx_count
    from transactions t
    where t.deleted_at is null
      and t.status in ('settled', 'reconciled', 'pending')
      and t.accrual_date between p_from and p_to
      and t.company_id = any(
            coalesce(
              p_company_ids,
              (select array_agg(c.id) from public.companies c where c.is_holding = false)
            )
          )
    group by t.cost_center_id
  )
  select
    g.cost_center_id,
    coalesce(cc.name, 'Sem centro de custo') as cost_center_name,
    g.companies_count,
    g.revenue,
    g.expense,
    (g.revenue - g.expense) as net,
    case when g.revenue > 0 then ((g.revenue - g.expense) / g.revenue) * 100 else null end,
    g.tx_count
  from grouped g
  left join cost_centers cc on cc.id = g.cost_center_id
  order by (g.revenue - g.expense) desc nulls last;
$$;

grant execute on function public.cost_center_analysis_multi(date, date, uuid[]) to authenticated;

comment on function public.cost_center_analysis_multi(date, date, uuid[]) is
  'Resultado por centro de custo. O centro é global, então a agregação entre empresas é o próprio group by. p_company_ids null = operacionais acessíveis; array = recorte. companies_count diz de quantas empresas o total veio.';

-- Wrapper de uma empresa: assinatura e colunas preservadas para o servidor MCP.
create or replace function public.cost_center_analysis(
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
security invoker
set search_path = public
as $$
  select
    m.cost_center_id, m.cost_center_name, m.revenue, m.expense,
    m.net, m.margin_pct, m.transaction_count
  from public.cost_center_analysis_multi(p_from, p_to, array[p_company_id]) m
  order by m.net desc nulls last;
$$;

grant execute on function public.cost_center_analysis(uuid, date, date) to authenticated;

-- Série mensal: some a coluna que vinha da view, o resto é igual.
create or replace function public.cost_center_monthly_series_multi(
  p_from date,
  p_to date,
  p_basis public.accounting_basis default 'accrual',
  p_company_ids uuid[] default null
)
returns table (
  month date,
  company_id uuid,
  cost_center_id uuid,
  cost_center_name text,
  revenue numeric,
  expense numeric,
  transaction_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc(
      'month',
      case when p_basis = 'cash' then t.cash_date else t.accrual_date end
    )::date as month,
    t.company_id,
    t.cost_center_id,
    coalesce(cc.name, 'Sem centro de custo') as cost_center_name,
    sum(case when t.direction = 'inflow'  then t.amount else 0 end) as revenue,
    sum(case when t.direction = 'outflow' then t.amount else 0 end) as expense,
    count(*)::int as transaction_count
  from transactions t
  left join cost_centers cc on cc.id = t.cost_center_id
  where t.deleted_at is null
    and t.company_id = any(
          coalesce(
            p_company_ids,
            (select array_agg(c.id) from public.companies c where c.is_holding = false)
          )
        )
    and case
          when p_basis = 'cash'
            then t.status in ('settled', 'reconciled')
             and t.cash_date between p_from and p_to
          else t.status in ('settled', 'reconciled', 'pending')
             and t.accrual_date between p_from and p_to
        end
  group by 1, 2, 3, 4;
$$;

grant execute on function public.cost_center_monthly_series_multi(date, date, public.accounting_basis, uuid[]) to authenticated;
