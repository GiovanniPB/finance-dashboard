-- v_bills e v_bills_aging passam a respeitar a RLS de quem consulta.
--
-- As duas nasceram sem `security_invoker` (20260514194441_ap_ar_views_and_rpcs).
-- `v_transactions` e `v_transactions_signed` foram corrigidas em
-- 20260513145137_15_fix_security_advisors — as de títulos vieram depois e ficaram
-- de fora. Como o dono é `postgres`, dono também de `transactions`, e a tabela não
-- tem `force row level security`, a view executa a consulta de base com os
-- privilégios do dono e a RLS **não se aplica**.
--
-- Medido no remoto, impersonando um `viewer` com acesso a 1 das 4 empresas:
--
--   transactions   (RLS)  -> 1 empresa,  800 linhas
--   v_bills              -> 4 empresas, 2821 linhas
--   v_bills_aging        -> 4 empresas,   18 linhas
--
-- Não era só teórico: `fetchBills` e `fetchAging` (src/features/bills/api.ts) só
-- filtram `company_id` quando existe empresa selecionada. Com "todas as empresas"
-- no switcher, a tela /bills exibia título, contraparte e valor de empresa à qual
-- a pessoa não tem acesso — bastavam login no app e a anon key.
--
-- Efeito da correção nas telas: "todas as empresas" passa a significar "todas as
-- que eu enxergo". Nenhuma consulta existente quebra; as que já filtravam por
-- empresa continuam idênticas.
--
-- Custo: a RLS de `transactions` está no formato InitPlan da convenção
-- (20260814132620_rls_initplan_optimization) e resolve a agregação em ~3,4ms no
-- volume atual do remoto — folgado diante do `statement_timeout` de 8s do papel
-- `authenticated`.
--
-- `alter view ... set (...)` não recria a view: colunas, dependências e grants
-- ficam onde estão.

alter view public.v_bills set (security_invoker = true);
alter view public.v_bills_aging set (security_invoker = true);

comment on view public.v_bills is
  'AP/AR enriquecida (em aberto ou liquidada recentemente) com effective_status calculado. security_invoker: a RLS de transactions recorta as linhas por acesso do usuário.';

comment on view public.v_bills_aging is
  'Aging por faixa de vencimento: vencido 0-30/31-60/61-90/+90, a vencer 0-30/31-60/61-90/+90 e sem vencimento. A soma das faixas é o total em aberto. security_invoker: recortada pela RLS de transactions.';
