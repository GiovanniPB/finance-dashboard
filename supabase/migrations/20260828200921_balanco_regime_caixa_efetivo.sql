-- Balanço gerencial: alternar entre competência e caixa.
--
-- Reenvio do conteúdo de `20260828200457_balanco_regime_caixa`, que ficou
-- registrada no remoto com zero statements (marcada como aplicada sem executar) e
-- por isso nunca chegaria ao banco. Aquele arquivo foi esvaziado para o histórico
-- local continuar batendo com o remoto; o efeito vem daqui.

-- Enum e não texto: regime inválido tem que ser erro na fronteira do banco, e
-- não um silencioso "caiu no padrão".
create type public.accounting_basis as enum ('accrual', 'cash');

comment on type public.accounting_basis is
  'Regime do relatório: accrual = competência (data de competência), cash = caixa (data de caixa).';

-- Derruba a versão de três argumentos antes de criar a de quatro. Adicionar um
-- parâmetro com default criaria uma SOBRECARGA, não uma substituição: a chamada
-- com três argumentos continuaria batendo na função antiga e o regime seria
-- silenciosamente ignorado.
drop function if exists public.cost_center_monthly_series(uuid, date, date);

-- Série mensal por centro de custo — a matéria-prima da matriz.
--
-- Devolve o dado cru (um par mês × centro por linha) e deixa o cálculo das linhas
-- e fórmulas no TypeScript, onde ele é testável sem banco.
--
-- OS DOIS REGIMES seguem exatamente a convenção da DRE (ver
-- 20260812191239_dre_competencia_inclui_pendente):
--   competência — por `accrual_date`, com `settled`, `reconciled` e `pending`: o
--                 fato já ocorreu, receber ou pagar é outra questão;
--   caixa       — por `cash_date`, só `settled` e `reconciled`: o que efetivamente
--                 transitou. `pending` não tem `cash_date` e cai fora sozinho.
-- `scheduled` fica de fora dos dois (ocorrência futura de recorrência é previsão).
--
-- O mês do lançamento MUDA com o regime: competência em janeiro com caixa em
-- fevereiro cai em colunas diferentes. É por isso que o regime é parâmetro da
-- consulta e não uma segunda coluna no mesmo resultado.
--
-- Mês sem movimento não volta linha: o eixo de meses é montado no cliente a
-- partir do período, então o buraco vira zero na matriz.
create function public.cost_center_monthly_series(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_basis public.accounting_basis default 'accrual'
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
    date_trunc(
      'month',
      case when p_basis = 'cash' then t.cash_date else t.accrual_date end
    )::date as month,
    t.cost_center_id,
    coalesce(cc.name, 'Sem centro de custo') as cost_center_name,
    sum(case when t.direction = 'inflow'  then t.amount else 0 end) as revenue,
    sum(case when t.direction = 'outflow' then t.amount else 0 end) as expense,
    count(*)::int as transaction_count
  from transactions t
  left join cost_centers cc on cc.id = t.cost_center_id
  where t.company_id = p_company_id
    and t.deleted_at is null
    and case
          when p_basis = 'cash'
            then t.status in ('settled', 'reconciled')
             and t.cash_date between p_from and p_to
          else t.status in ('settled', 'reconciled', 'pending')
             and t.accrual_date between p_from and p_to
        end
  group by 1, 2, 3;
$$;

grant execute on function public.cost_center_monthly_series(uuid, date, date, public.accounting_basis) to authenticated;
