-- =============================================================================
-- DRE: a coluna de COMPETÊNCIA passa a incluir lançamento `pending`
--
-- O PROBLEMA. As duas colunas da DRE filtravam `status in ('settled','reconciled')`.
-- Isso torna a coluna "competência" um regime de CAIXA datado por `accrual_date` —
-- não competência. Receita ganha e ainda não recebida simplesmente não aparecia em
-- nenhuma das duas colunas.
--
-- Passou desapercebido porque, com todo lançamento sendo criado já liquidado, os
-- dois regimes coincidem. A projeção do pagar.me quebra essa coincidência: uma
-- venda em 12x nasce como 1 linha liquidada e 11 pendentes, e a decisão D2 do
-- projeto é competência INTEGRAL na venda. Sem esta correção a receita de uma venda
-- de 12x entraria diluída mês a mês conforme cada parcela liquida — exatamente o
-- que a decisão rejeitou.
--
-- IMPACTO NO HISTÓRICO: zero. Não existe hoje nenhum lançamento `pending` no banco
-- (2.212 `settled`, 246 `scheduled`, 1 `canceled`). Nenhum número de DRE já fechada
-- muda. É por isso que a correção pode ser feita agora, e não depois de a projeção
-- gerar milhares de linhas pendentes.
--
-- POR QUE `scheduled` FICA DE FORA. `scheduled` é ocorrência FUTURA de recorrência,
-- gerada por horizonte (hoje 246 linhas, indo até 08/2027) — é previsão, não fato
-- ocorrido. Além disso 28 delas têm competência no passado e somam R$ 83.603,13:
-- incluí-las mexeria em meses já fechados, o que é decisão de política contábil e
-- não faz parte desta correção.
--
-- A coluna de CAIXA não muda: caixa é o que entrou ou saiu, e ponto.
-- =============================================================================
drop function if exists public.dre_by_company(uuid, date, date);
drop function if exists public.dre_consolidated(uuid, date, date);

create function public.dre_by_company(p_company_id uuid, p_start date, p_end date)
returns table(
  account_id uuid, parent_id uuid, code text, name text,
  kind account_kind, dre_section dre_section, is_summary boolean,
  below_the_line boolean, sign_hint text, sort_order integer,
  total numeric, total_cash numeric
)
language sql
stable
set search_path to 'public'
as $function$
  with sums as (
    select
      a.id as account_id,
      sum(
        case
          when t.accrual_date between p_start and p_end
           -- competência: o fato já ocorreu, receber/pagar é outra questão
           and t.status in ('settled','reconciled','pending')
          then case when t.direction = 'inflow' then t.amount else -t.amount end
          else 0
        end
      )::numeric as total_accrual,
      sum(
        case
          when t.cash_date between p_start and p_end
           -- caixa: só o que efetivamente transitou
           and t.status in ('settled','reconciled')
          then case when t.direction = 'inflow' then t.amount else -t.amount end
          else 0
        end
      )::numeric as total_cash
    from chart_of_accounts a
    left join v_transactions t on t.account_id = a.id
    where a.company_id = p_company_id
    group by a.id
  )
  select
    a.id, a.parent_id, a.code, a.name, a.kind, a.dre_section,
    a.is_summary, a.below_the_line, a.sign_hint, a.sort_order,
    coalesce(s.total_accrual, 0)::numeric,
    coalesce(s.total_cash, 0)::numeric
  from chart_of_accounts a
  left join sums s on s.account_id = a.id
  where a.company_id = p_company_id and a.is_active = true
  order by a.sort_order, a.code;
$function$;

create function public.dre_consolidated(p_organization_id uuid, p_start date, p_end date)
returns table(
  master_id uuid, parent_id uuid, code text, name text,
  kind account_kind, dre_section dre_section, is_summary boolean,
  below_the_line boolean, sign_hint text, sort_order integer,
  total numeric, total_cash numeric
)
language sql
stable
set search_path to 'public'
as $function$
  with sums as (
    select
      a.master_account_id as master_id,
      sum(
        case
          when t.accrual_date between p_start and p_end
           and t.status in ('settled','reconciled','pending')
          then case when t.direction = 'inflow' then t.amount else -t.amount end
          else 0
        end
      )::numeric as total_accrual,
      sum(
        case
          when t.cash_date between p_start and p_end
           and t.status in ('settled','reconciled')
          then case when t.direction = 'inflow' then t.amount else -t.amount end
          else 0
        end
      )::numeric as total_cash
    from v_transactions t
    join chart_of_accounts a on a.id = t.account_id
    join companies c on c.id = t.company_id
    where c.organization_id = p_organization_id
      and c.is_holding = false
      and a.master_account_id is not null
    group by a.master_account_id
  )
  select
    m.id, m.parent_id, m.code, m.name, m.kind, m.dre_section,
    m.is_summary, m.below_the_line, m.sign_hint, m.sort_order,
    coalesce(s.total_accrual, 0)::numeric,
    coalesce(s.total_cash, 0)::numeric
  from chart_of_accounts_master m
  left join sums s on s.master_id = m.id
  where m.organization_id = p_organization_id and m.is_active = true
  order by m.sort_order, m.code;
$function$;

comment on function public.dre_by_company(uuid, date, date) is
  'DRE de uma empresa em dupla base. Competência inclui `pending` (fato ocorrido, ainda não recebido/pago); caixa só o que transitou.';
comment on function public.dre_consolidated(uuid, date, date) is
  'DRE consolidada do grupo em dupla base, agregada pelo plano-mestre. Mesmo critério de status do `dre_by_company`.';
