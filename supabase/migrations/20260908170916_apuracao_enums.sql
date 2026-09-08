-- Apuração de impostos (1/3): tipos.
--
-- Migration separada de propósito: `alter type ... add value` adiciona o rótulo mas o
-- Postgres não permite USÁ-LO na mesma transação em que foi criado ("unsafe use of new
-- value of enum type"). Como cada arquivo de migration roda numa transação, os novos
-- rótulos de `tax_obligation_kind` só podem aparecer em default, check ou insert a
-- partir da migration seguinte.

-- ---------------------------------------------------------------------------
-- 1) Tributos que faltavam no enum existente.
--
-- `irrf_dividendos` é o IRRF de 10% sobre distribuição de lucros acima do limite
-- mensal por sócio. Não cabia em `irrf_retencao` (que é retenção sofrida pela empresa
-- na nota, dedutível do próprio tributo): aqui a empresa é a fonte pagadora e o valor
-- é recolhido em nome do sócio, nunca deduzido do IRPJ dela.
-- ---------------------------------------------------------------------------
alter type public.tax_obligation_kind add value if not exists 'irrf_dividendos';

-- ---------------------------------------------------------------------------
-- 2) Classes de presunção do Lucro Presumido.
--
-- São os percentuais de presunção definidos em lei por atividade. O rótulo aqui é só
-- a CHAVE que liga a receita à faixa; o percentual em si vive em
-- `tax_rule_presumptions`, porque difere entre IRPJ e CSLL para a mesma classe
-- (revenda de mercadoria: 8% de IRPJ contra 12% de CSLL).
-- ---------------------------------------------------------------------------
create type public.tax_presumption_class as enum (
  'revenda_mercadoria',   -- comércio: 8% IRPJ / 12% CSLL
  'industria',            -- industrialização: 8% / 12%
  'servico_geral',        -- serviços em geral: 32% / 32%
  'servico_transporte',   -- transporte de carga: 8% / 12%; demais: 16% / 12%
  'servico_hospitalar',   -- 8% / 12%
  'combustivel_revenda',  -- 1,6% / 12%
  'financeiro_exterior',  -- ganho de capital, aplicação financeira, exterior: 100%
  'outras'
);

-- Periodicidade da apuração. ISS/PIS/COFINS são mensais; IRPJ/CSLL do presumido são
-- trimestrais — e é justamente essa diferença que a ferramenta antiga não tinha.
create type public.tax_period_kind as enum ('monthly', 'quarterly', 'annual');

-- De onde sai a base de cálculo.
create type public.tax_base_source as enum (
  'revenue_accounts',  -- contas de receita do plano de contas (decisão do dono do repo)
  'dividends',         -- distribuição de lucros por sócio (IRRF de 10%)
  'payroll',           -- folha (INSS patronal, FGTS)
  'manual'             -- só linhas digitadas
);

-- `draft` recalcula à vontade; `confirmed` é imutável até ser reaberta. Não existe
-- estado "superseded": em sistema contábil, duas apurações vivas do mesmo período são
-- convite a divergência — reabrir é explícito e auditado.
create type public.tax_assessment_status as enum ('draft', 'confirmed');

-- As seções do demonstrativo, na ordem em que a planilha as apresenta.
create type public.tax_assessment_line_kind as enum (
  'revenue',         -- saídas / serviços / receita do período
  'revenue_return',  -- devolução de saída (valor negativo)
  'retention',       -- retenção sofrida na fonte, dedutível do tributo devido
  'deduction',       -- outras deduções do período
  'addition',        -- acréscimos (multa, juros)
  'carryforward'     -- saldo de período anterior
);

-- Ajuste do vencimento quando cai em dia não útil. DARF posterga; ISS de Barueri
-- antecipa. A planilha erra isso na mão: o ISS de outubro/2026 está marcado num sábado.
create type public.tax_due_date_adjust as enum (
  'none',
  'previous_business_day',
  'next_business_day'
);

-- Como a franquia da base se comporta quando o beneficiário passa do limite.
--
-- Existe porque a planilha da OTM não decide: ela aplica 10% sobre R$ 442.580
-- INTEIROS, com a observação "sócios acima de R$ 49.999,99". Isso admite duas
-- leituras — tributar só o excedente, ou tributar tudo de quem passou do limite — e a
-- diferença é da ordem de R$ 20 mil no mês. Configurar é mais honesto que escolher.
create type public.tax_allowance_mode as enum (
  'excess',              -- tributa só o que passa da franquia
  'full_when_exceeded'   -- passando da franquia, tributa o valor todo
);
