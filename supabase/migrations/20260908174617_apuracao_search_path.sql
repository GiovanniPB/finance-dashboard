-- Apuração: fixa o `search_path` das quatro funções que nasceram sem ele.
--
-- O advisor de segurança do Supabase (`function_search_path_mutable`) apontou
-- `tax_uf_from_ibge`, `tax_period_start`, `tax_period_end` e `tax_assessment_inputs`.
-- Sem `search_path` fixo, quem chama a função pode trocar o esquema resolvido e fazer
-- um nome não qualificado apontar para outro objeto. As três primeiras são `immutable`
-- e não leem tabela, e a quarta é `security invoker` (não escala privilégio), então o
-- risco real aqui é baixo — mas a correção é de uma linha e a alternativa é conviver
-- com advisor sujo, que é como defeito de verdade passa desapercebido.
--
-- `alter function ... set search_path` em vez de recriar: preserva corpo, permissões e
-- dependências, e não corre o risco de a recriação divergir do original.

alter function public.tax_uf_from_ibge(text)
  set search_path = public;

alter function public.tax_period_start(public.tax_period_kind, date)
  set search_path = public;

alter function public.tax_period_end(public.tax_period_kind, date)
  set search_path = public;

alter function public.tax_assessment_inputs(uuid, public.tax_obligation_kind, date)
  set search_path = public;

-- Confere que as quatro ficaram com a configuração — o reset falha aqui se alguma
-- assinatura mudar e o `alter` acima passar a mirar outra função.
do $$
declare
  v_faltando text;
begin
  select string_agg(p.proname, ', ')
    into v_faltando
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('tax_uf_from_ibge', 'tax_period_start', 'tax_period_end',
                      'tax_assessment_inputs')
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) as cfg
      where cfg like 'search_path=%'
    );

  if v_faltando is not null then
    raise exception 'Funções da apuração ainda sem search_path fixo: %', v_faltando;
  end if;
end $$;
