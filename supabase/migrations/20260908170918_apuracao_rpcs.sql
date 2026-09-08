-- Apuração de impostos (3/3): calendário, colheita da base e persistência.
--
-- DIVISÃO DE RESPONSABILIDADE (importa, é o que impede a regra de existir duas vezes):
--
--   · SQL  = CALENDÁRIO e COLHEITA. O vencimento depende da tabela de feriados, e a
--            base depende dos lançamentos sob RLS. Nada disso é aritmética de tributo.
--   · TS   = ARITMÉTICA. Presunção em faixas, adicional, franquia, retenção, saldo
--            devedor. Vive em `supabase/functions/_shared/tax/apuracao.ts`, é pura e
--            é testada no Vitest contra as quatro planilhas reais.
--   · SQL  = PERSISTÊNCIA com verificação. `save_tax_assessment` NÃO recalcula a regra
--            (isso seria a segunda implementação), mas confere a COERÊNCIA INTERNA do
--            que recebeu — soma das linhas, ordem das deduções, piso zero — e
--            recalcula o VENCIMENTO por conta própria, ignorando o do cliente.
--
-- Assim a tela e as tools de MCP compartilham a mesma aritmética, e o banco continua
-- sendo a autoridade sobre data e sobre consistência do que grava.

-- =============================================================================
-- 1) Calendário: dia útil
-- =============================================================================

-- UF a partir do código IBGE do município: os dois primeiros dígitos do código de 7
-- dígitos SÃO o código da UF (35 = SP, e Barueri é 3505708). Derivar evita uma coluna
-- nova em `companies` que poderia divergir do município do ISS — e divergir aqui
-- significa aplicar o feriado estadual errado no vencimento.
create or replace function public.tax_uf_from_ibge(p_municipio_ibge text)
returns text
language sql
immutable
as $$
  select case left(coalesce(p_municipio_ibge, ''), 2)
    when '11' then 'RO' when '12' then 'AC' when '13' then 'AM' when '14' then 'RR'
    when '15' then 'PA' when '16' then 'AP' when '17' then 'TO' when '21' then 'MA'
    when '22' then 'PI' when '23' then 'CE' when '24' then 'RN' when '25' then 'PB'
    when '26' then 'PE' when '27' then 'AL' when '28' then 'SE' when '29' then 'BA'
    when '31' then 'MG' when '32' then 'ES' when '33' then 'RJ' when '35' then 'SP'
    when '41' then 'PR' when '42' then 'SC' when '43' then 'RS' when '50' then 'MS'
    when '51' then 'MT' when '52' then 'GO' when '53' then 'DF'
    else null
  end;
$$;

grant execute on function public.tax_uf_from_ibge(text) to authenticated;

-- Um dia é útil quando não é sábado, não é domingo e não é feriado no escopo da
-- empresa (nacional sempre; estadual conforme UF; municipal conforme município).
create or replace function public.tax_is_business_day(
  p_date           date,
  p_uf             text default null,
  p_municipio_ibge text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select extract(isodow from p_date) < 6
     and not exists (
       select 1 from public.tax_holidays h
       where h.holiday_date = p_date
         and (
           h.scope = 'national'
           or (h.scope = 'state'     and p_uf             is not null and h.uf = p_uf)
           or (h.scope = 'municipal' and p_municipio_ibge is not null and h.municipio_ibge = p_municipio_ibge)
         )
     );
$$;

-- Move a data para o dia útil na direção pedida. Limite de 15 iterações: mais que
-- isso não é feriado, é tabela de feriado cadastrada errado — e loop infinito num
-- `stable` chamado pela UI derrubaria a página com `statement_timeout`.
create or replace function public.tax_adjust_business_day(
  p_date           date,
  p_adjust         public.tax_due_date_adjust,
  p_uf             text default null,
  p_municipio_ibge text default null
)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_date date := p_date;
  v_step int;
  v_guard int := 0;
begin
  if p_adjust = 'none' then
    return v_date;
  end if;

  v_step := case p_adjust when 'previous_business_day' then -1 else 1 end;

  while not public.tax_is_business_day(v_date, p_uf, p_municipio_ibge) loop
    v_guard := v_guard + 1;
    if v_guard > 15 then
      raise exception
        'Não achei dia útil a partir de % em 15 dias — confira public.tax_holidays', p_date
        using errcode = 'data_exception';
    end if;
    v_date := v_date + v_step;
  end loop;

  return v_date;
end;
$$;

-- =============================================================================
-- 2) Calendário: limites do período e vencimento
-- =============================================================================

-- Normaliza qualquer data para o início do período que a contém. É o que permite a UI
-- mandar "algum dia de setembro" e a apuração trimestral entender "3º trimestre".
create or replace function public.tax_period_start(
  p_period_kind public.tax_period_kind,
  p_date        date
)
returns date
language sql
immutable
as $$
  select case p_period_kind
    when 'monthly'   then date_trunc('month',   p_date)::date
    when 'quarterly' then date_trunc('quarter', p_date)::date
    when 'annual'    then date_trunc('year',    p_date)::date
  end;
$$;

create or replace function public.tax_period_end(
  p_period_kind public.tax_period_kind,
  p_date        date
)
returns date
language sql
immutable
as $$
  select (
    public.tax_period_start(p_period_kind, p_date)
    + case p_period_kind
        when 'monthly'   then interval '1 month'
        when 'quarterly' then interval '3 months'
        when 'annual'    then interval '1 year'
      end
    - interval '1 day'
  )::date;
$$;

-- Vencimento nominal = dia `p_due_day` do mês que está `p_offset` meses depois do mês
-- em que o período termina, ajustado para dia útil.
--
-- `p_due_day = 31` significa "último dia do mês": é truncado pelo tamanho do mês, que
-- é como se expressa o vencimento do IRPJ/CSLL trimestral ("último dia útil do mês
-- subsequente ao trimestre").
create or replace function public.tax_due_date(
  p_period_end     date,
  p_due_day        smallint,
  p_month_offset   smallint,
  p_adjust         public.tax_due_date_adjust,
  p_uf             text default null,
  p_municipio_ibge text default null
)
returns date
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select (date_trunc('month', p_period_end) + (p_month_offset || ' months')::interval)::date as month_start
  ),
  nominal as (
    select (
      month_start
      + (least(
           p_due_day::int,
           extract(day from (month_start + interval '1 month' - interval '1 day'))::int
         ) - 1) * interval '1 day'
    )::date as d
    from base
  )
  select public.tax_adjust_business_day(d, p_adjust, p_uf, p_municipio_ibge) from nominal;
$$;

revoke execute on function public.tax_is_business_day(date, text, text) from public, anon;
revoke execute on function public.tax_adjust_business_day(date, public.tax_due_date_adjust, text, text) from public, anon;
revoke execute on function public.tax_due_date(date, smallint, smallint, public.tax_due_date_adjust, text, text) from public, anon;
grant execute on function public.tax_is_business_day(date, text, text) to authenticated;
grant execute on function public.tax_adjust_business_day(date, public.tax_due_date_adjust, text, text) to authenticated;
grant execute on function public.tax_period_start(public.tax_period_kind, date) to authenticated;
grant execute on function public.tax_period_end(public.tax_period_kind, date) to authenticated;
grant execute on function public.tax_due_date(date, smallint, smallint, public.tax_due_date_adjust, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Regressão do calendário, executada no `db:reset`.
--
-- Não é preciosismo: os três casos abaixo são datas que a PLANILHA ERRA na mão —
-- vencimento marcado em sábado e em domingo. Se alguém mexer na tabela de feriados
-- ou na aritmética da data, o reset falha aqui em vez de a divergência aparecer em
-- produção como multa por atraso.
-- -----------------------------------------------------------------------------
do $$
declare
  v date;
begin
  -- ISS de Barueri, competência 09/2026: dia 10 cai num SÁBADO -> antecipa p/ 09/10.
  v := public.tax_due_date('2026-09-30'::date, 10::smallint, 1::smallint,
                           'previous_business_day', 'SP', '3505708');
  assert v = '2026-10-09'::date, format('ISS 09/2026 deu %s, esperado 2026-10-09', v);

  -- PIS/COFINS, competência 11/2026: dia 25 cai numa SEXTA útil -> não move.
  v := public.tax_due_date('2026-11-30'::date, 25::smallint, 1::smallint,
                           'previous_business_day', 'SP', '3505708');
  assert v = '2026-12-24'::date, format('PIS/COFINS 11/2026 deu %s, esperado 2026-12-24', v);

  -- IRPJ/CSLL do 3t2026: "último dia útil do mês subsequente". 31/10/2026 é SÁBADO
  -- (a planilha registra 31/10) -> antecipa p/ 30/10.
  v := public.tax_due_date('2026-09-30'::date, 31::smallint, 1::smallint,
                           'previous_business_day', 'SP', '3505708');
  assert v = '2026-10-30'::date, format('IRPJ 3t2026 deu %s, esperado 2026-10-30', v);

  -- IRPJ/CSLL do 4t2026: 31/01/2027 é DOMINGO (a planilha registra 31/01) -> 29/01.
  v := public.tax_due_date('2026-12-31'::date, 31::smallint, 1::smallint,
                           'previous_business_day', 'SP', '3505708');
  assert v = '2027-01-29'::date, format('IRPJ 4t2026 deu %s, esperado 2027-01-29', v);

  -- DAS do Simples posterga em vez de antecipar: dia 20 de 12/2026 é DOMINGO -> 21.
  v := public.tax_due_date('2026-11-30'::date, 20::smallint, 1::smallint,
                           'next_business_day', 'SP', '3505708');
  assert v = '2026-12-21'::date, format('DAS 11/2026 deu %s, esperado 2026-12-21', v);

  -- Feriado municipal de Barueri só fere quem é de Barueri.
  assert public.tax_is_business_day('2026-12-08'::date, 'SP', '3505708') = false,
    'Nossa Senhora da Conceição deveria ferir Barueri';
  assert public.tax_is_business_day('2026-12-08'::date, 'SP', '3550308') = true,
    'Feriado de Barueri não pode ferir outro município';

  -- Período trimestral normaliza qualquer data do trimestre.
  assert public.tax_period_start('quarterly', '2026-08-14'::date) = '2026-07-01'::date;
  assert public.tax_period_end('quarterly', '2026-08-14'::date)   = '2026-09-30'::date;
  assert public.tax_period_end('monthly',    '2026-02-05'::date)  = '2026-02-28'::date;
end $$;

-- =============================================================================
-- 3) Colheita da base + insumos da apuração
--
-- `security invoker` de propósito: a leitura passa pela RLS do usuário. Um `viewer`
-- com acesso a uma empresa não pode ver a base de cálculo de outra.
--
-- ESTADO DOS LANÇAMENTOS: `pending`, `settled` e `reconciled` — exatamente o mesmo
-- conjunto da coluna de COMPETÊNCIA da DRE (ver `..._dre_competencia_inclui_pendente`).
-- Se divergisse, a DRE e a apuração discordariam sobre a receita do mês, que é a
-- classe de defeito que este projeto existe para impedir. `scheduled` fica fora: é
-- previsão de recorrência, não fato ocorrido.
-- =============================================================================
create or replace function public.tax_assessment_inputs(
  p_company_id  uuid,
  p_kind        public.tax_obligation_kind,
  p_period_date date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_rule           public.tax_rules%rowtype;
  v_start          date;
  v_end            date;
  v_uf             text;
  v_municipio      text;
  v_assessment     public.tax_assessments%rowtype;
  v_gathered       jsonb;
  v_manual         jsonb;
  v_presumptions   jsonb;
begin
  -- Regra vigente para o período. `valid_from <= fim do período` e vigência aberta ou
  -- terminando depois do início — ordenada da mais recente para a mais antiga.
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

  -- Faixas de presunção da regra.
  select coalesce(jsonb_agg(jsonb_build_object(
           'presumption_class', p.presumption_class,
           'threshold_from',    p.threshold_from,
           'threshold_to',      p.threshold_to,
           'rate',              p.rate
         ) order by p.presumption_class, p.threshold_from), '[]'::jsonb)
    into v_presumptions
  from public.tax_rule_presumptions p
  where p.rule_id = v_rule.id;

  -- Linhas colhidas dos lançamentos.
  if v_rule.base_source = 'revenue_accounts' then
    select coalesce(jsonb_agg(x order by x.reference_date, x.description), '[]'::jsonb)
      into v_gathered
    from (
      select
        -- Saída numa conta de receita é estorno/devolução: entra negativa.
        case when t.direction = 'inflow' then 'revenue' else 'revenue_return' end as line_kind,
        t.id                                            as transaction_id,
        t.account_id                                    as account_id,
        t.description                                   as description,
        t.document_ref                                  as document_ref,
        t.accrual_date                                  as reference_date,
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
        and t.accrual_date between v_start and v_end
    ) x;

  elsif v_rule.base_source = 'dividends' then
    select coalesce(jsonb_agg(x order by x.payee, x.reference_date), '[]'::jsonb)
      into v_gathered
    from (
      select
        'revenue'                as line_kind,   -- "base do tributo", não receita
        t.id                     as transaction_id,
        t.account_id             as account_id,
        t.description            as description,
        t.document_ref           as document_ref,
        coalesce(t.cash_date, t.accrual_date) as reference_date,
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
        -- IRRF de dividendo é por regime de CAIXA: o fato gerador é o pagamento.
        and coalesce(t.cash_date, t.accrual_date) between v_start and v_end
    ) x;

  else
    v_gathered := '[]'::jsonb;
  end if;

  -- Linhas manuais da apuração existente: retenção sofrida, outras deduções, saldo
  -- anterior. Sobrevivem ao recálculo — é o que impede o imposto subir em silêncio
  -- quando alguém reaperta "Apurar".
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
    'rule', jsonb_build_object(
      'id',                        v_rule.id,
      'kind',                      v_rule.kind,
      'period_kind',               v_rule.period_kind,
      'base_source',               v_rule.base_source,
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

-- =============================================================================
-- 4) Persistência da apuração
--
-- Recebe o resultado da aritmética e grava. NÃO recalcula a regra — mas recusa o que
-- for internamente incoerente, e recalcula o vencimento por conta própria.
-- =============================================================================
create or replace function public.save_tax_assessment(p_payload jsonb)
returns public.tax_assessments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company     uuid := (p_payload ->> 'company_id')::uuid;
  v_kind        public.tax_obligation_kind := (p_payload ->> 'kind')::public.tax_obligation_kind;
  v_rule        public.tax_rules%rowtype;
  v_start       date := (p_payload ->> 'period_start')::date;
  v_end         date;
  v_uf          text;
  v_municipio   text;
  v_due         date;
  v_a           public.tax_assessments%rowtype;
  v_lines       jsonb := coalesce(p_payload -> 'lines', '[]'::jsonb);
  v_sum_base    numeric;
  v_expected    numeric;
  v_tax         numeric := round(coalesce((p_payload ->> 'tax_amount')::numeric, 0), 2);
  v_surtax      numeric := round(coalesce((p_payload ->> 'surtax_amount')::numeric, 0), 2);
  v_ret         numeric := round(coalesce((p_payload ->> 'retentions')::numeric, 0), 2);
  v_ded         numeric := round(coalesce((p_payload ->> 'deductions')::numeric, 0), 2);
  v_add         numeric := round(coalesce((p_payload ->> 'additions')::numeric, 0), 2);
  v_due_amount  numeric := round(coalesce((p_payload ->> 'amount_due')::numeric, 0), 2);
  v_base        numeric := round(coalesce((p_payload ->> 'taxable_base')::numeric, 0), 2);
begin
  select * into v_rule from public.tax_rules where id = (p_payload ->> 'rule_id')::uuid;
  if not found then
    raise exception 'Regra do tributo não encontrada' using errcode = 'no_data_found';
  end if;
  if v_rule.company_id <> v_company or v_rule.kind <> v_kind then
    raise exception 'A regra informada não é desta empresa/tributo';
  end if;

  v_start := public.tax_period_start(v_rule.period_kind, v_start);
  v_end   := public.tax_period_end(v_rule.period_kind, v_start);

  -- Apuração confirmada é imutável. Reabrir é um ato explícito e auditado.
  select * into v_a from public.tax_assessments
   where company_id = v_company and kind = v_kind and period_start = v_start
     for update;
  if found and v_a.status = 'confirmed' then
    raise exception 'A apuração de % de % já está confirmada', v_kind, to_char(v_start, 'MM/YYYY')
      using hint = 'Reabra com reopen_tax_assessment(id) antes de recalcular.';
  end if;

  -- --- Coerência interna do que veio do cliente -----------------------------
  -- (a) o saldo devedor tem de ser a conta certa, na ordem certa, com piso zero.
  --     É exatamente o erro das planilhas de PIS/COFINS, onde "valor a recolher"
  --     saiu de `retenção - outras deduções` em vez de `devido - retenção - deduções`.
  v_expected := greatest(v_tax + v_surtax + v_add - v_ret - v_ded, 0);
  if abs(v_expected - v_due_amount) > 0.01 then
    raise exception
      'Saldo devedor incoerente: recebi % mas devido(%) + adicional(%) + acréscimos(%) - retenções(%) - deduções(%) = %',
      v_due_amount, v_tax, v_surtax, v_add, v_ret, v_ded, v_expected
      using errcode = 'data_exception';
  end if;

  -- (b) a base tem de ser a soma das linhas de base. Sem isso, um cliente poderia
  --     gravar um demonstrativo que não fecha com o próprio total.
  select coalesce(sum(round((l ->> 'base_amount')::numeric, 2)), 0)
    into v_sum_base
  from jsonb_array_elements(v_lines) l
  where (l ->> 'line_kind') in ('revenue', 'revenue_return');

  -- A base nunca pode passar da soma das linhas: é o que impede gravar demonstrativo
  -- que não fecha com o próprio total.
  if v_base > greatest(v_sum_base, 0) + 0.01 then
    raise exception 'Base de cálculo (%) maior que a soma das linhas (%)', v_base, v_sum_base
      using errcode = 'data_exception';
  end if;

  -- Sem franquia, a base É a soma das linhas — com duas exceções legítimas, ambas com
  -- piso zero: soma negativa (devolução maior que a venda) e presunção que zerou a
  -- classe. Fora delas, diferença é incoerência.
  if v_rule.base_allowance is null
     and v_sum_base > 0
     and v_base <> 0
     and abs(v_sum_base - v_base) > 0.01 then
    raise exception 'Base de cálculo (%) não fecha com a soma das linhas (%)', v_base, v_sum_base
      using errcode = 'data_exception';
  end if;

  -- (c) retenção só entra quando a regra permite deduzir.
  if not v_rule.deducts_retentions and v_ret <> 0 then
    raise exception 'A regra de % não permite deduzir retenção, mas veio % de retenção', v_kind, v_ret
      using errcode = 'data_exception';
  end if;

  -- --- Vencimento: autoridade do banco, nunca do cliente --------------------
  select coalesce(f.municipio_ibge, '3505708')
    into v_municipio
  from public.companies c
  left join public.fiscal_company_settings f on f.company_id = c.id
  where c.id = v_company;
  v_uf := public.tax_uf_from_ibge(v_municipio);

  v_due := public.tax_due_date(v_end, v_rule.due_day, v_rule.due_month_offset,
                               v_rule.due_date_adjust, v_uf, v_municipio);

  insert into public.tax_assessments (
    company_id, rule_id, kind, period_kind, period_start, period_end, status,
    gross_revenue, taxable_base, rate, tax_amount, surtax_base, surtax_amount,
    retentions, deductions, additions, amount_due, due_date, computed_at,
    notes, metadata, created_by
  ) values (
    v_company, v_rule.id, v_kind, v_rule.period_kind, v_start, v_end, 'draft',
    round(coalesce((p_payload ->> 'gross_revenue')::numeric, 0), 2),
    v_base, v_rule.rate, v_tax,
    round(coalesce((p_payload ->> 'surtax_base')::numeric, 0), 2), v_surtax,
    v_ret, v_ded, v_add, v_due_amount, v_due, now(),
    p_payload ->> 'notes', coalesce(p_payload -> 'metadata', '{}'::jsonb), auth.uid()
  )
  on conflict (company_id, kind, period_start) do update set
    rule_id       = excluded.rule_id,
    period_kind   = excluded.period_kind,
    period_end    = excluded.period_end,
    gross_revenue = excluded.gross_revenue,
    taxable_base  = excluded.taxable_base,
    rate          = excluded.rate,
    tax_amount    = excluded.tax_amount,
    surtax_base   = excluded.surtax_base,
    surtax_amount = excluded.surtax_amount,
    retentions    = excluded.retentions,
    deductions    = excluded.deductions,
    additions     = excluded.additions,
    amount_due    = excluded.amount_due,
    due_date      = excluded.due_date,
    computed_at   = now(),
    notes         = excluded.notes,
    metadata      = excluded.metadata,
    updated_at    = now()
  returning * into v_a;

  -- Linhas: troca por completo. As manuais voltam no payload (a UI as recebeu de
  -- `tax_assessment_inputs` e as devolve), então não há perda.
  delete from public.tax_assessment_lines where assessment_id = v_a.id;

  insert into public.tax_assessment_lines (
    assessment_id, line_kind, sort_order, description, document_ref, reference_date,
    presumption_class, amount, presumption_rate, base_amount, is_manual,
    transaction_id, account_id, payee, metadata
  )
  select
    v_a.id,
    (l ->> 'line_kind')::public.tax_assessment_line_kind,
    coalesce((l ->> 'sort_order')::int, 0),
    l ->> 'description',
    l ->> 'document_ref',
    (l ->> 'reference_date')::date,
    nullif(l ->> 'presumption_class', '')::public.tax_presumption_class,
    round((l ->> 'amount')::numeric, 2),
    (l ->> 'presumption_rate')::numeric,
    round(coalesce((l ->> 'base_amount')::numeric, 0), 2),
    coalesce((l ->> 'is_manual')::boolean, false),
    nullif(l ->> 'transaction_id', '')::uuid,
    nullif(l ->> 'account_id', '')::uuid,
    l ->> 'payee',
    coalesce(l -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(v_lines) l;

  return v_a;
end;
$$;

grant execute on function public.save_tax_assessment(jsonb) to authenticated;

-- =============================================================================
-- 5) Confirmar e reabrir
-- =============================================================================

-- Confirmar congela a apuração e cria (ou atualiza) a obrigação de pagamento. Daqui
-- em diante o fluxo é o que já existia: `mark_tax_paid` lança a saída no caixa.
create or replace function public.confirm_tax_assessment(p_assessment_id uuid)
returns public.tax_obligations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_a  public.tax_assessments%rowtype;
  v_ob public.tax_obligations%rowtype;
begin
  select * into v_a from public.tax_assessments where id = p_assessment_id for update;
  if not found then
    raise exception 'Apuração não encontrada' using errcode = 'no_data_found';
  end if;
  if v_a.status = 'confirmed' then
    raise exception 'Esta apuração já está confirmada';
  end if;

  update public.tax_assessments
     set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), updated_at = now()
   where id = p_assessment_id
  returning * into v_a;

  insert into public.tax_obligations (
    company_id, kind, reference_period, due_date, amount_estimated,
    base_amount, rate_pct, assessment_id, notes, metadata, created_by
  ) values (
    v_a.company_id, v_a.kind, v_a.period_start, v_a.due_date, v_a.amount_due,
    v_a.taxable_base, round(v_a.rate * 100, 4), v_a.id, v_a.notes,
    jsonb_build_object(
      'origem',        'apuracao',
      'period_kind',   v_a.period_kind,
      'period_end',    v_a.period_end,
      'gross_revenue', v_a.gross_revenue,
      'tax_amount',    v_a.tax_amount,
      'surtax_amount', v_a.surtax_amount,
      'retentions',    v_a.retentions,
      'deductions',    v_a.deductions
    ),
    auth.uid()
  )
  on conflict (company_id, kind, reference_period) do update set
    due_date         = excluded.due_date,
    amount_estimated = excluded.amount_estimated,
    base_amount      = excluded.base_amount,
    rate_pct         = excluded.rate_pct,
    assessment_id    = excluded.assessment_id,
    metadata         = excluded.metadata,
    updated_at       = now()
    -- Obrigação já paga não é mexida: o valor pago é fato, e a apuração que o
    -- contradiga tem de ser resolvida por retificação, não sobrescrevendo o caixa.
    where tax_obligations.status <> 'paid'
  returning * into v_ob;

  if v_ob.id is null then
    select * into v_ob from public.tax_obligations
     where company_id = v_a.company_id and kind = v_a.kind and reference_period = v_a.period_start;
    raise warning 'A obrigação de % de % já está paga — valor no caixa preservado',
      v_a.kind, to_char(v_a.period_start, 'MM/YYYY');
  end if;

  return v_ob;
end;
$$;

grant execute on function public.confirm_tax_assessment(uuid) to authenticated;

-- Reabrir volta ao rascunho para recalcular. Recusa se a obrigação já foi paga —
-- nesse ponto a correção é retificação, não recálculo.
create or replace function public.reopen_tax_assessment(p_assessment_id uuid)
returns public.tax_assessments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_a public.tax_assessments%rowtype;
begin
  select * into v_a from public.tax_assessments where id = p_assessment_id for update;
  if not found then
    raise exception 'Apuração não encontrada' using errcode = 'no_data_found';
  end if;

  if exists (
    select 1 from public.tax_obligations
    where assessment_id = p_assessment_id and status = 'paid'
  ) then
    raise exception 'A obrigação desta apuração já foi paga'
      using hint = 'Corrija por retificação: crie a apuração do período seguinte com o ajuste.';
  end if;

  update public.tax_assessments
     set status = 'draft', confirmed_at = null, confirmed_by = null, updated_at = now()
   where id = p_assessment_id
  returning * into v_a;

  return v_a;
end;
$$;

grant execute on function public.reopen_tax_assessment(uuid) to authenticated;
