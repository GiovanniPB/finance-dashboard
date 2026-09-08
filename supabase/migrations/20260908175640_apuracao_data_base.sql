-- Apuração: a DATA que define o período da base vira parâmetro da regra.
--
-- O DEFEITO QUE ISTO CORRIGE
-- --------------------------
-- `tax_assessment_inputs` colhia a base sempre por `accrual_date`, justificado por
-- consistência com a coluna de competência da DRE. Medido contra a planilha do
-- contador na OTM Assessoria, isso dá a base ERRADA:
--
--                        accrual_date      cash_date       planilha
--   IRPJ 3t2026        R$   681.872,60   R$ 1.543.003,86  R$ 1.543.003,86
--   ISS ago/2026       R$         0,00   R$   681.872,60  R$   681.872,60
--
-- A razão: o lançamento de comissão tem `accrual_date` no mês a que a comissão SE
-- REFERE ("comissão ref julho 2026", accrual 10/07, caixa 07/08), enquanto a
-- competência fiscal é a da NOTA — que nesses dados cai no `cash_date`.
--
-- Não existe resposta universal: depende do tributo e de como a empresa registra a
-- receita. O IRRF de dividendos já era caixa (fato gerador é o pagamento); o ISS de
-- serviço segue a nota; e o lucro presumido admite regime de caixa. Então isto é
-- PARÂMETRO, não constante — e um parâmetro que, errado, muda o imposto em mais de
-- 100%.
--
-- Além do parâmetro, a RPC passa a devolver o total pela OUTRA base
-- (`gross_revenue_alt_basis`), para o motor avisar quando as duas divergem. É o que
-- impede este mesmo erro voltar em silêncio numa empresa nova.

create type public.tax_base_date_basis as enum (
  'accrual',  -- competência: `accrual_date`
  'cash'      -- caixa/nota: `cash_date`, caindo para `accrual_date` quando ainda não há
);

alter table public.tax_rules
  add column base_date_basis public.tax_base_date_basis not null default 'accrual';

comment on column public.tax_rules.base_date_basis is
  'Qual data do lançamento delimita o período da base. Errar isto desloca a base em um mês inteiro — confira contra o demonstrativo da contabilidade.';

-- =============================================================================
-- `tax_assessment_inputs` com a data-base parametrizada
-- =============================================================================
create or replace function public.tax_assessment_inputs(
  p_company_id  uuid,
  p_kind        public.tax_obligation_kind,
  p_period_date date
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_rule         public.tax_rules%rowtype;
  v_start        date;
  v_end          date;
  v_uf           text;
  v_municipio    text;
  v_assessment   public.tax_assessments%rowtype;
  v_gathered     jsonb;
  v_manual       jsonb;
  v_presumptions jsonb;
  v_alt          numeric;
begin
  select * into v_rule
  from public.tax_rules r
  where r.company_id = p_company_id
    and r.kind = p_kind
    and r.active
    and r.valid_from <= p_period_date
    and (r.valid_to is null or r.valid_to >= p_period_date)
  order by r.valid_from desc
  limit 1;

  if not found then
    raise exception 'Nenhuma regra ativa de % para esta empresa', p_kind
      using errcode = 'no_data_found',
            hint = 'Cadastre a regra do tributo em /taxes > Regras antes de apurar.';
  end if;

  v_start := public.tax_period_start(v_rule.period_kind, p_period_date);
  v_end   := public.tax_period_end(v_rule.period_kind, p_period_date);

  select coalesce(f.municipio_ibge, '3505708')
    into v_municipio
  from public.companies c
  left join public.fiscal_company_settings f on f.company_id = c.id
  where c.id = p_company_id;
  v_uf := public.tax_uf_from_ibge(v_municipio);

  select * into v_assessment
  from public.tax_assessments
  where company_id = p_company_id and kind = p_kind and period_start = v_start;

  select coalesce(jsonb_agg(jsonb_build_object(
           'presumption_class', p.presumption_class,
           'threshold_from',    p.threshold_from,
           'threshold_to',      p.threshold_to,
           'rate',              p.rate
         ) order by p.presumption_class, p.threshold_from), '[]'::jsonb)
    into v_presumptions
  from public.tax_rule_presumptions p
  where p.rule_id = v_rule.id;

  -- ---------------------------------------------------------------------------
  -- Colheita. `v_base_date` é a data que delimita o período, conforme a regra.
  --
  -- No modo `cash`, lançamento ainda sem `cash_date` entra pela competência em vez de
  -- desaparecer: receita fora da base por falta de data de caixa seria erro silencioso,
  -- e o aviso de divergência entre as duas bases dá a pista.
  -- ---------------------------------------------------------------------------
  if v_rule.base_source = 'revenue_accounts' then
    select coalesce(jsonb_agg(x order by x.reference_date, x.description), '[]'::jsonb)
      into v_gathered
    from (
      select
        case when t.direction = 'inflow' then 'revenue' else 'revenue_return' end as line_kind,
        t.id                                            as transaction_id,
        t.account_id                                    as account_id,
        t.description                                   as description,
        t.document_ref                                  as document_ref,
        case v_rule.base_date_basis
          when 'cash' then coalesce(t.cash_date, t.accrual_date)
          else t.accrual_date
        end                                             as reference_date,
        case when t.direction = 'inflow' then t.amount else -t.amount end as amount,
        a.presumption_class                             as presumption_class,
        cp.name                                         as payee
      from public.transactions t
      join public.chart_of_accounts a on a.id = t.account_id
      left join public.counterparties cp on cp.id = t.counterparty_id
      where t.company_id = p_company_id
        and t.deleted_at is null
        and t.status in ('pending', 'settled', 'reconciled')
        and a.kind = 'revenue'
        and a.is_summary = false
        and (v_rule.base_account_ids is null or t.account_id = any(v_rule.base_account_ids))
        and (case v_rule.base_date_basis
               when 'cash' then coalesce(t.cash_date, t.accrual_date)
               else t.accrual_date
             end) between v_start and v_end
    ) x;

    -- Total pela OUTRA base, para o motor avisar quando as duas divergem.
    select coalesce(sum(case when t.direction = 'inflow' then t.amount else -t.amount end), 0)
      into v_alt
    from public.transactions t
    join public.chart_of_accounts a on a.id = t.account_id
    where t.company_id = p_company_id
      and t.deleted_at is null
      and t.status in ('pending', 'settled', 'reconciled')
      and a.kind = 'revenue'
      and a.is_summary = false
      and (v_rule.base_account_ids is null or t.account_id = any(v_rule.base_account_ids))
      and (case v_rule.base_date_basis
             when 'cash' then t.accrual_date
             else coalesce(t.cash_date, t.accrual_date)
           end) between v_start and v_end;

  elsif v_rule.base_source = 'dividends' then
    select coalesce(jsonb_agg(x order by x.payee, x.reference_date), '[]'::jsonb)
      into v_gathered
    from (
      select
        'revenue'                as line_kind,
        t.id                     as transaction_id,
        t.account_id             as account_id,
        t.description            as description,
        t.document_ref           as document_ref,
        case v_rule.base_date_basis
          when 'cash' then coalesce(t.cash_date, t.accrual_date)
          else t.accrual_date
        end                      as reference_date,
        t.amount                 as amount,
        null::public.tax_presumption_class as presumption_class,
        coalesce(cp.name, '(sócio não identificado)') as payee
      from public.transactions t
      left join public.counterparties cp on cp.id = t.counterparty_id
      where t.company_id = p_company_id
        and t.deleted_at is null
        and t.status in ('pending', 'settled', 'reconciled')
        and t.direction = 'outflow'
        and t.account_id = any(v_rule.base_account_ids)
        and (case v_rule.base_date_basis
               when 'cash' then coalesce(t.cash_date, t.accrual_date)
               else t.accrual_date
             end) between v_start and v_end
    ) x;

    select coalesce(sum(t.amount), 0) into v_alt
    from public.transactions t
    where t.company_id = p_company_id
      and t.deleted_at is null
      and t.status in ('pending', 'settled', 'reconciled')
      and t.direction = 'outflow'
      and t.account_id = any(v_rule.base_account_ids)
      and (case v_rule.base_date_basis
             when 'cash' then t.accrual_date
             else coalesce(t.cash_date, t.accrual_date)
           end) between v_start and v_end;

  else
    v_gathered := '[]'::jsonb;
    v_alt := 0;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',               l.id,
           'line_kind',        l.line_kind,
           'sort_order',       l.sort_order,
           'description',      l.description,
           'document_ref',     l.document_ref,
           'reference_date',   l.reference_date,
           'presumption_class',l.presumption_class,
           'amount',           l.amount,
           'payee',            l.payee
         ) order by l.line_kind, l.sort_order), '[]'::jsonb)
    into v_manual
  from public.tax_assessment_lines l
  where l.assessment_id = v_assessment.id and l.is_manual;

  return jsonb_build_object(
    'company_id',       p_company_id,
    'kind',             p_kind,
    'period_kind',      v_rule.period_kind,
    'period_start',     v_start,
    'period_end',       v_end,
    'months_in_period', (extract(year from v_end) * 12 + extract(month from v_end))
                        - (extract(year from v_start) * 12 + extract(month from v_start)) + 1,
    'due_date',         public.tax_due_date(v_end, v_rule.due_day, v_rule.due_month_offset,
                                            v_rule.due_date_adjust, v_uf, v_municipio),
    'base_date_basis',        v_rule.base_date_basis,
    'gross_revenue_alt_basis', v_alt,
    'rule', jsonb_build_object(
      'id',                        v_rule.id,
      'kind',                      v_rule.kind,
      'period_kind',               v_rule.period_kind,
      'base_source',               v_rule.base_source,
      'base_date_basis',           v_rule.base_date_basis,
      'rate',                      v_rule.rate,
      'uses_presumption',          v_rule.uses_presumption,
      'default_presumption_class', v_rule.default_presumption_class,
      'surtax_rate',               v_rule.surtax_rate,
      'surtax_monthly_allowance',  v_rule.surtax_monthly_allowance,
      'base_allowance',            v_rule.base_allowance,
      'base_allowance_per_payee',  v_rule.base_allowance_per_payee,
      'base_allowance_mode',       v_rule.base_allowance_mode,
      'deducts_retentions',        v_rule.deducts_retentions,
      'payee',                     v_rule.payee,
      'account_id',                v_rule.account_id,
      'presumptions',              v_presumptions
    ),
    'assessment', case when v_assessment.id is null then null else jsonb_build_object(
      'id',     v_assessment.id,
      'status', v_assessment.status
    ) end,
    'gathered_lines', v_gathered,
    'manual_lines',   v_manual
  );
end;
$$;

grant execute on function public.tax_assessment_inputs(uuid, public.tax_obligation_kind, date) to authenticated;
