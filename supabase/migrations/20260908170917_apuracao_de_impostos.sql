-- Apuração de impostos (2/3): schema.
--
-- CONTEXTO
-- --------
-- Até aqui `/taxes` só sabia agendar pagamento: `generate_tax_obligations` criava DAS
-- do Simples e um PIS/COFINS linear, e o resto do processo vivia em planilha — uma por
-- empresa, por família de tributo, por mês. As planilhas fazem três coisas ao mesmo
-- tempo, e é essa mistura que impede automatizar:
--
--   1. PARÂMETRO   — quais tributos, alíquota, presunção, vencimento, recebedor.
--   2. DEMONSTRATIVO — a lista dos documentos que compõem a base, linha por linha.
--   3. APURAÇÃO    — base -> presunção -> tributo -> retenções -> saldo devedor.
--
-- Esta migration separa as três: (1) vira `tax_rules` + `tax_rule_presumptions`,
-- (2) vira `tax_assessment_lines`, (3) vira `tax_assessments`. `tax_obligations`
-- continua sendo o que já era de fato — o PAGAMENTO — e passa a apontar para a
-- apuração que o originou.
--
-- O QUE AS PLANILHAS EXIGEM E NÃO EXISTIA
-- ---------------------------------------
--   · apuração TRIMESTRAL (IRPJ/CSLL do presumido) — `reference_period` era só mês;
--   · presunção por TIPO de receita (mercadoria 8%/12%, serviço 32%, exterior 100%);
--   · faixa de presunção (32% até R$ 1.250.000/trimestre, 35,2% no excedente);
--   · adicional de IRPJ de 10% acima de R$ 60.000 por trimestre;
--   · retenção sofrida na fonte deduzida do tributo devido;
--   · vencimento por tributo, ajustado para dia útil.
--
-- DECISÃO: a base sai dos LANÇAMENTOS (`transactions` em contas de receita), não dos
-- documentos fiscais. Por isso a classificação de presunção mora no plano de contas —
-- é lá que a receita já está separada por natureza.

-- =============================================================================
-- 1) Classificação fiscal da receita no plano de contas
--
-- Só faz sentido em conta de receita. Fica nulo no resto, e conta de receita sem
-- classe cai na classe padrão da regra (ver `tax_rules.default_presumption_class`),
-- para que uma conta nova não desapareça silenciosamente da base de cálculo.
-- =============================================================================
alter table public.chart_of_accounts_master
  add column presumption_class public.tax_presumption_class;
alter table public.chart_of_accounts
  add column presumption_class public.tax_presumption_class;

comment on column public.chart_of_accounts.presumption_class is
  'Classe de presunção do Lucro Presumido desta receita. NULL = usa a classe padrão da regra do tributo.';

-- A cópia do plano mestre para a empresa tem de levar a classe, senão empresa criada
-- pela UI nasce com a receita sem classificação fiscal e fora da base de cálculo.
-- Reescrita de `..._seed_company_chart_of_accounts_on_insert` com uma única diferença:
-- `presumption_class` na lista de colunas copiadas.
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
    is_summary, below_the_line, sign_hint, sort_order, is_active,
    presumption_class
  )
  select
    p_company_id, m.code, m.name, m.kind, m.dre_section, m.id,
    m.is_summary, m.below_the_line, m.sign_hint, m.sort_order, true,
    m.presumption_class
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

-- =============================================================================
-- 2) Calendário de dias não úteis
--
-- Dado de referência agnóstico de ambiente (feriado nacional é feriado em qualquer
-- banco), então vai em migration — ao contrário de dado de negócio, que vai no seed.
-- =============================================================================
create table public.tax_holidays (
  id              uuid primary key default gen_random_uuid(),
  holiday_date    date not null,
  name            text not null,
  scope           text not null check (scope in ('national', 'state', 'municipal')),
  uf              text check (uf is null or length(uf) = 2),
  municipio_ibge  text,
  created_at      timestamptz not null default now(),

  -- Coerência entre escopo e localidade: feriado nacional não tem UF nem município;
  -- municipal exige município. Sem isso, um feriado de Barueri cadastrado como
  -- 'national' feriaria o vencimento de todas as empresas.
  constraint tax_holidays_scope_ck check (
    (scope = 'national'  and uf is null and municipio_ibge is null)
    or (scope = 'state'     and uf is not null and municipio_ibge is null)
    or (scope = 'municipal' and municipio_ibge is not null)
  )
);

create unique index uq_tax_holidays
  on public.tax_holidays(holiday_date, scope, coalesce(uf, ''), coalesce(municipio_ibge, ''));
create index idx_tax_holidays_date on public.tax_holidays(holiday_date);

comment on table public.tax_holidays is
  'Dias não úteis para ajuste de vencimento. Feriado móvel (Carnaval, Páscoa, Corpus Christi) é linha explícita por ano — não há cálculo de data de Páscoa no banco.';

-- =============================================================================
-- 3) Regra do tributo, por empresa
--
-- Uma linha por (empresa, tributo, vigência). Vigência aberta (`valid_to` nulo) é a
-- regra corrente; mudança de alíquota cria linha nova em vez de editar a antiga, para
-- que apuração de período passado continue reproduzível.
-- =============================================================================
create table public.tax_rules (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references public.companies(id) on delete cascade,
  kind                        public.tax_obligation_kind not null,
  period_kind                 public.tax_period_kind not null default 'monthly',
  base_source                 public.tax_base_source not null default 'revenue_accounts',

  -- Restringe a colheita a contas específicas do plano.
  --   `revenue_accounts`: NULL = todas as contas de receita (o caso normal).
  --   `dividends`:        obrigatório — as contas de distribuição de lucros, que não
  --                       são receita e por isso não têm como ser inferidas.
  base_account_ids            uuid[],

  -- Alíquota do tributo sobre a base (0.0065 PIS, 0.03 COFINS, 0.02 ISS,
  -- 0.15 IRPJ, 0.09 CSLL, 0.10 IRRF de dividendos).
  rate                        numeric(9, 6) not null check (rate >= 0 and rate <= 1),

  -- Presunção: quando falso, a base É a receita (ISS, PIS, COFINS). Quando verdadeiro,
  -- a base sai de `tax_rule_presumptions` por classe de receita (IRPJ, CSLL).
  uses_presumption            boolean not null default false,
  default_presumption_class   public.tax_presumption_class,

  -- Adicional (só IRPJ hoje): 10% sobre o que passar de R$ 20.000 por mês de período,
  -- ou seja R$ 60.000 no trimestre. Guardado por mês para não errar em período
  -- quebrado (empresa aberta no meio do trimestre apura menos meses).
  surtax_rate                 numeric(9, 6) check (surtax_rate is null or (surtax_rate >= 0 and surtax_rate <= 1)),
  surtax_monthly_allowance    numeric(18, 2) check (surtax_monthly_allowance is null or surtax_monthly_allowance >= 0),

  -- Franquia da própria base (IRRF de dividendos: 10% só sobre o que passar do limite
  -- mensal por sócio). Diferente de `surtax_*`, que é um segundo tributo sobre a mesma
  -- base — aqui a franquia reduz a base do tributo principal.
  base_allowance              numeric(18, 2) check (base_allowance is null or base_allowance >= 0),
  base_allowance_per_payee    boolean not null default false,
  base_allowance_mode         public.tax_allowance_mode not null default 'excess',

  -- Retenção sofrida na fonte é dedutível deste tributo? (IRPJ/PIS/COFINS sim;
  -- IRRF de dividendos não — ali a empresa é a fonte pagadora, não a retida.)
  deducts_retentions          boolean not null default false,

  -- Vencimento: `due_day` no mês `due_month_offset` meses após o FIM do período.
  -- `due_day = 31` significa último dia do mês (é truncado pelo tamanho do mês), que
  -- é como se expressa "último dia útil" do IRPJ/CSLL trimestral.
  due_day                     smallint not null check (due_day between 1 and 31),
  due_month_offset            smallint not null default 1 check (due_month_offset between 0 and 12),
  due_date_adjust             public.tax_due_date_adjust not null default 'next_business_day',

  payee                       text,
  -- Conta de DRE usada no lançamento do pagamento (dedução de receita, tipicamente).
  account_id                  uuid references public.chart_of_accounts(id) on delete set null,

  valid_from                  date not null default date_trunc('year', now())::date,
  valid_to                    date,
  active                      boolean not null default true,
  notes                       text,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references auth.users(id) on delete set null,

  constraint tax_rules_validity_ck check (valid_to is null or valid_to >= valid_from),
  -- Presunção sem classe padrão deixaria receita não classificada fora da base.
  constraint tax_rules_presumption_ck check (
    not uses_presumption or default_presumption_class is not null
  ),
  -- Franquia por beneficiário só faz sentido quando há franquia.
  constraint tax_rules_allowance_ck check (
    not base_allowance_per_payee or base_allowance is not null
  ),
  -- Adicional é par: alíquota e franquia andam juntas.
  constraint tax_rules_surtax_ck check (
    (surtax_rate is null) = (surtax_monthly_allowance is null)
  ),
  -- Dividendo não tem conta de receita para inferir: sem lista explícita, a colheita
  -- voltaria vazia e o IRRF sairia zero — erro silencioso, o pior tipo aqui.
  constraint tax_rules_dividend_accounts_ck check (
    base_source <> 'dividends'
    or (base_account_ids is not null and cardinality(base_account_ids) > 0)
  )
);

create unique index uq_tax_rules_vigencia
  on public.tax_rules(company_id, kind, valid_from);
create index idx_tax_rules_company on public.tax_rules(company_id) where active;

create trigger trg_tax_rules_updated before update on public.tax_rules
  for each row execute function set_updated_at();
create trigger trg_audit_tax_rules
  after insert or update or delete on public.tax_rules
  for each row execute function audit_record();

comment on table public.tax_rules is
  'Parâmetro do tributo por empresa: alíquota, presunção, adicional, retenção e vencimento. Substitui as células de parâmetro das planilhas de cálculo.';

-- =============================================================================
-- 4) Faixas de presunção da regra
--
-- ATENÇÃO À SEMÂNTICA DA FAIXA: o limite é medido contra a receita DA PRÓPRIA CLASSE
-- no período, não contra a receita total. Para a OTM Assessoria dá no mesmo (só tem
-- serviço) e reproduz a planilha; para a JCE não há faixa. Se algum dia uma empresa
-- multiclasse ganhar faixa, a decisão de medir por classe ou pelo total precisa ser
-- revisada de propósito — não herdada por acidente.
-- =============================================================================
create table public.tax_rule_presumptions (
  id                 uuid primary key default gen_random_uuid(),
  rule_id            uuid not null references public.tax_rules(id) on delete cascade,
  presumption_class  public.tax_presumption_class not null,
  threshold_from     numeric(18, 2) not null default 0 check (threshold_from >= 0),
  threshold_to       numeric(18, 2) check (threshold_to is null or threshold_to > threshold_from),
  rate               numeric(9, 6) not null check (rate >= 0 and rate <= 1),
  notes              text,
  created_at         timestamptz not null default now()
);

create unique index uq_tax_rule_presumptions
  on public.tax_rule_presumptions(rule_id, presumption_class, threshold_from);

comment on table public.tax_rule_presumptions is
  'Percentual de presunção por classe de receita, com faixas. Faixa medida sobre a receita da própria classe no período.';

-- =============================================================================
-- 5) Apuração
-- =============================================================================
create table public.tax_assessments (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  rule_id          uuid references public.tax_rules(id) on delete set null,
  kind             public.tax_obligation_kind not null,
  period_kind      public.tax_period_kind not null,
  period_start     date not null,
  period_end       date not null,
  status           public.tax_assessment_status not null default 'draft',

  -- Resultado. Todos preenchidos pela apuração; nenhum é digitado.
  gross_revenue    numeric(18, 2) not null default 0,  -- receita bruta do período
  taxable_base     numeric(18, 2) not null default 0,  -- base após presunção e franquia
  rate             numeric(9, 6)  not null default 0,
  tax_amount       numeric(18, 2) not null default 0,  -- tributo básico
  surtax_base      numeric(18, 2) not null default 0,
  surtax_amount    numeric(18, 2) not null default 0,  -- adicional
  retentions       numeric(18, 2) not null default 0 check (retentions >= 0),
  deductions       numeric(18, 2) not null default 0 check (deductions >= 0),
  additions        numeric(18, 2) not null default 0 check (additions >= 0),
  amount_due       numeric(18, 2) not null default 0 check (amount_due >= 0),

  due_date         date not null,
  computed_at      timestamptz,
  confirmed_at     timestamptz,
  confirmed_by     uuid references auth.users(id) on delete set null,
  notes            text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,

  constraint tax_assessments_period_ck check (period_end >= period_start),
  constraint tax_assessments_confirmed_ck check (
    (status = 'confirmed') = (confirmed_at is not null)
  )
);

-- Uma apuração viva por (empresa, tributo, período). Recalcular sobrescreve o rascunho.
create unique index uq_tax_assessments_periodo
  on public.tax_assessments(company_id, kind, period_start);
create index idx_tax_assessments_due
  on public.tax_assessments(company_id, due_date) where status = 'draft';

create trigger trg_tax_assessments_updated before update on public.tax_assessments
  for each row execute function set_updated_at();
create trigger trg_audit_tax_assessments
  after insert or update or delete on public.tax_assessments
  for each row execute function audit_record();

comment on table public.tax_assessments is
  'Apuração de um tributo num período: base, presunção, adicional, retenções e saldo devedor. Substitui a aba de cálculo das planilhas.';

-- =============================================================================
-- 6) Linhas do demonstrativo
--
-- É o que a planilha da JCE faz à mão: 100 NF-e + 3 NFS-e + ganho no exterior, cada
-- uma com seu percentual de presunção. Aqui elas vêm dos lançamentos.
--
-- `is_manual` é a distinção que importa: linha COLHIDA é regenerada a cada recálculo;
-- linha MANUAL (retenção sofrida, outras deduções, saldo anterior) sobrevive. Sem
-- isso, recalcular apagaria a retenção digitada e o imposto subiria em silêncio.
-- =============================================================================
create table public.tax_assessment_lines (
  id                 uuid primary key default gen_random_uuid(),
  assessment_id      uuid not null references public.tax_assessments(id) on delete cascade,
  line_kind          public.tax_assessment_line_kind not null,
  sort_order         int not null default 0,
  description        text not null,
  document_ref       text,
  reference_date     date,
  presumption_class  public.tax_presumption_class,

  amount             numeric(18, 2) not null,           -- valor contábil (pode ser negativo: devolução)
  presumption_rate   numeric(9, 6),
  base_amount        numeric(18, 2) not null default 0, -- amount × presumption_rate

  is_manual          boolean not null default false,
  transaction_id     uuid references public.transactions(id) on delete set null,
  account_id         uuid references public.chart_of_accounts(id) on delete set null,
  payee              text,   -- sócio, no IRRF de dividendos (franquia é por beneficiário)
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),

  -- Linha colhida nasce de um lançamento; linha sem lançamento tem de ser manual.
  -- É o que garante que todo número não digitado seja rastreável até a origem.
  constraint tax_assessment_lines_origem_ck check (is_manual or transaction_id is not null)
);

create index idx_tax_assessment_lines_assessment
  on public.tax_assessment_lines(assessment_id, line_kind, sort_order);
create index idx_tax_assessment_lines_tx
  on public.tax_assessment_lines(transaction_id) where transaction_id is not null;

comment on table public.tax_assessment_lines is
  'Demonstrativo da base de cálculo, linha por linha. is_manual=false é regenerada no recálculo; true sobrevive.';

-- =============================================================================
-- 7) Ligação com o pagamento
-- =============================================================================
alter table public.tax_obligations
  add column assessment_id uuid references public.tax_assessments(id) on delete set null;

create index idx_tax_obligations_assessment
  on public.tax_obligations(assessment_id) where assessment_id is not null;

comment on column public.tax_obligations.assessment_id is
  'Apuração que originou esta obrigação. NULL em obrigação criada à mão ou pelo generate_tax_obligations antigo.';

-- =============================================================================
-- 8) RLS
--
-- Leitura: módulo `taxes` + empresa acessível, na forma InitPlan + semi-join
-- (predicado sem dependência de linha dentro de `(select …)`; predicado com
-- dependência de linha como `coluna in (subquery não-correlacionada)`).
-- Escrita: `has_company_write_access` direto — incide sobre a linha escrita, que é
-- tipicamente uma, então o alerta de custo (que é do caminho de leitura) não se aplica.
-- =============================================================================
alter table public.tax_holidays enable row level security;
alter table public.tax_rules enable row level security;
alter table public.tax_rule_presumptions enable row level security;
alter table public.tax_assessments enable row level security;
alter table public.tax_assessment_lines enable row level security;

-- Feriado é dado de referência: todo mundo lê, só super admin escreve.
create policy tax_holidays_sel on public.tax_holidays
  for select to authenticated using (true);
create policy tax_holidays_all on public.tax_holidays
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

create policy tax_rules_sel on public.tax_rules
  for select to authenticated
  using (
    (select public.can_view_module('taxes'))
    and (
      (select public.is_super_admin())
      or company_id in (
           select ca.company_id from public.company_access ca
           where ca.user_id = (select auth.uid())
         )
    )
  );
create policy tax_rules_ins on public.tax_rules
  for insert to authenticated
  with check (
    (select public.can_view_module('taxes'))
    and public.has_company_write_access(company_id)
  );
create policy tax_rules_upd on public.tax_rules
  for update to authenticated
  using (public.has_company_write_access(company_id))
  with check (public.has_company_write_access(company_id));
create policy tax_rules_del on public.tax_rules
  for delete to authenticated
  using (public.has_company_write_access(company_id));

-- Faixa de presunção segue a visibilidade da regra dona (escopo pela tabela pai, na
-- forma `fk in (subquery)` — nunca chamada de função por linha).
create policy tax_rule_presumptions_sel on public.tax_rule_presumptions
  for select to authenticated
  using (
    (select public.can_view_module('taxes'))
    and rule_id in (
          select r.id from public.tax_rules r
          where (select public.is_super_admin())
             or r.company_id in (
                  select ca.company_id from public.company_access ca
                  where ca.user_id = (select auth.uid())
                )
        )
  );
create policy tax_rule_presumptions_ins on public.tax_rule_presumptions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tax_rules r
      where r.id = rule_id and public.has_company_write_access(r.company_id)
    )
  );
create policy tax_rule_presumptions_upd on public.tax_rule_presumptions
  for update to authenticated
  using (
    exists (
      select 1 from public.tax_rules r
      where r.id = rule_id and public.has_company_write_access(r.company_id)
    )
  )
  with check (
    exists (
      select 1 from public.tax_rules r
      where r.id = rule_id and public.has_company_write_access(r.company_id)
    )
  );
create policy tax_rule_presumptions_del on public.tax_rule_presumptions
  for delete to authenticated
  using (
    exists (
      select 1 from public.tax_rules r
      where r.id = rule_id and public.has_company_write_access(r.company_id)
    )
  );

create policy tax_assessments_sel on public.tax_assessments
  for select to authenticated
  using (
    (select public.can_view_module('taxes'))
    and (
      (select public.is_super_admin())
      or company_id in (
           select ca.company_id from public.company_access ca
           where ca.user_id = (select auth.uid())
         )
    )
  );
create policy tax_assessments_ins on public.tax_assessments
  for insert to authenticated
  with check (
    (select public.can_view_module('taxes'))
    and public.has_company_write_access(company_id)
  );
create policy tax_assessments_upd on public.tax_assessments
  for update to authenticated
  using (public.has_company_write_access(company_id))
  with check (public.has_company_write_access(company_id));
create policy tax_assessments_del on public.tax_assessments
  for delete to authenticated
  using (public.has_company_write_access(company_id));

create policy tax_assessment_lines_sel on public.tax_assessment_lines
  for select to authenticated
  using (
    (select public.can_view_module('taxes'))
    and assessment_id in (
          select a.id from public.tax_assessments a
          where (select public.is_super_admin())
             or a.company_id in (
                  select ca.company_id from public.company_access ca
                  where ca.user_id = (select auth.uid())
                )
        )
  );
create policy tax_assessment_lines_ins on public.tax_assessment_lines
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tax_assessments a
      where a.id = assessment_id and public.has_company_write_access(a.company_id)
    )
  );
create policy tax_assessment_lines_upd on public.tax_assessment_lines
  for update to authenticated
  using (
    exists (
      select 1 from public.tax_assessments a
      where a.id = assessment_id and public.has_company_write_access(a.company_id)
    )
  )
  with check (
    exists (
      select 1 from public.tax_assessments a
      where a.id = assessment_id and public.has_company_write_access(a.company_id)
    )
  );
create policy tax_assessment_lines_del on public.tax_assessment_lines
  for delete to authenticated
  using (
    exists (
      select 1 from public.tax_assessments a
      where a.id = assessment_id and public.has_company_write_access(a.company_id)
    )
  );

-- Trio restritivo: token de OAuth (cliente de IA) não escreve. O OAuth Server do
-- Supabase ainda não tem escopos, e o token carrega todos os privilégios do usuário.
-- Tabela nova nasce sem as policies da migration ..._mcp_oauth_sem_escrita.
do $$
declare
  t text;
begin
  foreach t in array array[
    'tax_holidays', 'tax_rules', 'tax_rule_presumptions',
    'tax_assessments', 'tax_assessment_lines'
  ]
  loop
    execute format($f$
      create policy oauth_sem_escrita_ins on public.%1$I
        as restrictive for insert to authenticated
        with check ((select auth.jwt() ->> 'client_id') is null);
      create policy oauth_sem_escrita_upd on public.%1$I
        as restrictive for update to authenticated
        using ((select auth.jwt() ->> 'client_id') is null)
        with check ((select auth.jwt() ->> 'client_id') is null);
      create policy oauth_sem_escrita_del on public.%1$I
        as restrictive for delete to authenticated
        using ((select auth.jwt() ->> 'client_id') is null);
    $f$, t);
  end loop;
end $$;

-- `security_invoker` nas views precisa que `authenticated` tenha select nas bases.
grant select on public.tax_holidays to authenticated;
grant select, insert, update, delete on public.tax_rules to authenticated;
grant select, insert, update, delete on public.tax_rule_presumptions to authenticated;
grant select, insert, update, delete on public.tax_assessments to authenticated;
grant select, insert, update, delete on public.tax_assessment_lines to authenticated;

-- =============================================================================
-- 9) Feriados nacionais 2026–2027 (dado de referência)
--
-- Móveis calculados a partir da Páscoa (05/04/2026 e 28/03/2027): Carnaval = -47d,
-- Sexta-feira Santa = -2d, Corpus Christi = +60d.
-- =============================================================================
insert into public.tax_holidays (holiday_date, name, scope) values
  ('2026-01-01', 'Confraternização Universal', 'national'),
  ('2026-02-16', 'Carnaval', 'national'),
  ('2026-02-17', 'Carnaval', 'national'),
  ('2026-04-03', 'Sexta-feira Santa', 'national'),
  ('2026-04-21', 'Tiradentes', 'national'),
  ('2026-05-01', 'Dia do Trabalho', 'national'),
  ('2026-06-04', 'Corpus Christi', 'national'),
  ('2026-09-07', 'Independência do Brasil', 'national'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'national'),
  ('2026-11-02', 'Finados', 'national'),
  ('2026-11-15', 'Proclamação da República', 'national'),
  ('2026-11-20', 'Consciência Negra', 'national'),
  ('2026-12-25', 'Natal', 'national'),
  ('2027-01-01', 'Confraternização Universal', 'national'),
  ('2027-02-08', 'Carnaval', 'national'),
  ('2027-02-09', 'Carnaval', 'national'),
  ('2027-03-26', 'Sexta-feira Santa', 'national'),
  ('2027-04-21', 'Tiradentes', 'national'),
  ('2027-05-01', 'Dia do Trabalho', 'national'),
  ('2027-05-27', 'Corpus Christi', 'national'),
  ('2027-09-07', 'Independência do Brasil', 'national'),
  ('2027-10-12', 'Nossa Senhora Aparecida', 'national'),
  ('2027-11-02', 'Finados', 'national'),
  ('2027-11-15', 'Proclamação da República', 'national'),
  ('2027-11-20', 'Consciência Negra', 'national'),
  ('2027-12-25', 'Natal', 'national');

-- Barueri (IBGE 3505708) — sede das empresas do grupo e município do ISS.
insert into public.tax_holidays (holiday_date, name, scope, municipio_ibge) values
  ('2026-03-26', 'Aniversário de Barueri',       'municipal', '3505708'),
  ('2026-12-08', 'Nossa Senhora da Conceição',   'municipal', '3505708'),
  ('2027-03-26', 'Aniversário de Barueri',       'municipal', '3505708'),
  ('2027-12-08', 'Nossa Senhora da Conceição',   'municipal', '3505708');
